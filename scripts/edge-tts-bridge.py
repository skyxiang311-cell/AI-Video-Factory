#!/usr/bin/env python3
"""Small JSON bridge around edge-tts for the TypeScript adapter."""

import asyncio
import json
import os
import sys
from pathlib import Path

import edge_tts


async def main() -> None:
    request = json.load(sys.stdin)
    audio_path = Path(request["audioPath"])
    metadata_path = Path(request["metadataPath"])
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    audio_tmp = audio_path.with_suffix(".tmp.mp3")
    metadata_tmp = metadata_path.with_suffix(".tmp.json")

    communicate = edge_tts.Communicate(
        request["text"],
        request["voice"],
        rate=request["rate"],
        volume=request["volume"],
        pitch=request["pitch"],
        boundary="WordBoundary",
    )
    boundaries = []
    with audio_tmp.open("wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                boundaries.append(
                    {
                        "text": chunk["text"],
                        "offsetTicks": chunk["offset"],
                        "durationTicks": chunk["duration"],
                    }
                )

    metadata_tmp.write_text(
        json.dumps({"boundaries": boundaries}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(audio_tmp, audio_path)
    os.replace(metadata_tmp, metadata_path)


if __name__ == "__main__":
    asyncio.run(main())
