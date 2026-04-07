"""OmniVoice TTS Server - OpenAI-compatible API server for AIRI integration."""
import base64
import io
import logging
import tempfile
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from omnivoice import OmniVoice

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

model = None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_NAME = "k2-fsa/OmniVoice"

# Reference audio for voice cloning (Jen_Frankie_spoiled.wav)
REF_AUDIO_PATH = Path(__file__).parent.parent.parent / "chatterbox" / "reference_audio" / "Jen_Frankie_spoiled.wav"
REF_TEXT = "Excuse me, I don't understand why me and my friends have to wait in line and pay full price, do you even realise how many TikTok followers do we have?!"


class TTSRequest(BaseModel):
    text: str
    format: str = "wav"
    voice: str = "default"
    seed: int = 42
    speed: float = 1.0
    num_step: int = 32
    ref_audio: str | None = None
    ref_text: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    logger.info("Loading OmniVoice model...")
    model = OmniVoice.from_pretrained(MODEL_NAME, device_map=DEVICE, dtype=torch.float16)
    logger.info("OmniVoice model loaded on %s", DEVICE)
    yield


app = FastAPI(title="OmniVoice TTS Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index():
    return {"service": "OmniVoice TTS Server", "status": "running", "endpoints": ["/v1/health", "/v1/tts"]}


@app.get("/v1/health")
def health():
    return {"status": "ok"}


@app.post("/v1/tts")
def tts(req: TTSRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded yet")

    torch.manual_seed(req.seed)

    ref_audio_path = None
    ref_text = None

    # Use provided ref audio or fall back to default
    if req.ref_audio and req.ref_text:
        ref_audio_path = req.ref_audio
        ref_text = req.ref_text
    elif REF_AUDIO_PATH.exists():
        ref_audio_path = str(REF_AUDIO_PATH)
        ref_text = REF_TEXT

    try:
        if ref_audio_path:
            audio = model.generate(
                text=req.text,
                ref_audio=ref_audio_path,
                ref_text=ref_text,
                num_step=req.num_step,
                speed=req.speed,
            )
        else:
            audio = model.generate(
                text=req.text,
                num_step=req.num_step,
                speed=req.speed,
            )

        # audio is a list of torch.Tensor with shape (1, T) at 24kHz
        audio_tensor = audio[0].squeeze(0).cpu()
        sample_rate = 24000

        # Save to WAV
        out_path = Path(tempfile.gettempdir()) / f"omnivoice_{uuid.uuid4().hex}.wav"
        sf.write(str(out_path), audio_tensor.numpy(), sample_rate, format='WAV')

        return FileResponse(
            str(out_path),
            media_type="audio/wav",
            headers={"Content-Disposition": f"attachment; filename={out_path.name}"},
        )

    except Exception as e:
        logger.error("TTS generation failed: %s", e, exc_info=True)
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
