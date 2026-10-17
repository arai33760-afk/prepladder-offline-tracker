from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

out = Path(__file__).resolve().parents[1] / 'src' / 'icons'
out.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    image = Image.new('RGB', (size, size), '#112b48')
    draw = ImageDraw.Draw(image)
    pad = round(size * .15)
    draw.rounded_rectangle((pad,pad,size-pad,size-pad), radius=round(size*.18), fill='#2467da')
    try:
        font = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', round(size*.43))
        plus_font = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', round(size*.28))
    except OSError:
        font = ImageFont.load_default()
        plus_font = ImageFont.load_default()
    draw.text((size*.31,size*.20),'P',font=font,fill='white')
    draw.text((size*.54,size*.42),'+',font=plus_font,fill='#57ecd5')
    image.save(out / f'icon-{size}.png')
