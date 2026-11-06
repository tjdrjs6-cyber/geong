"""Normalize newly added character PNGs to the shared 1024x1024 transparent canvas.
Usage: python scripts/normalize-character-art.py path/to/new_character.png [more.png ...]
Keep all screen-specific sizing in existing UI CSS; don't apply per-character CSS scales.
"""
from PIL import Image
from pathlib import Path
import sys
CANVAS=(1024,1024)
TARGET_HEIGHT_RATIO=0.88
TARGET_WIDTH_RATIO=0.88

def normalize(path):
    path=Path(path)
    im=Image.open(path).convert('RGBA')
    bbox=im.getchannel('A').getbbox()
    if not bbox: raise ValueError(f'Empty alpha: {path}')
    art=im.crop(bbox)
    factor=min(CANVAS[0]*TARGET_WIDTH_RATIO/art.width,CANVAS[1]*TARGET_HEIGHT_RATIO/art.height)
    newsize=(max(1,round(art.width*factor)),max(1,round(art.height*factor)))
    art=art.resize(newsize,Image.Resampling.LANCZOS)
    out=Image.new('RGBA',CANVAS,(0,0,0,0))
    out.alpha_composite(art,((CANVAS[0]-newsize[0])//2,(CANVAS[1]-newsize[1])//2))
    out.save(path,optimize=True)
    print(f'{path}: {im.size} -> {CANVAS}, visible art {newsize}')

if __name__=='__main__':
    if len(sys.argv)<2: raise SystemExit('Pass new character PNG file(s)')
    for arg in sys.argv[1:]: normalize(arg)
