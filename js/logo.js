// INKUBIO logo (same shapes as img/logo.svg) drawn into a 2D canvas, for 3D textures: truck, incubator, boxes.
const EGG = 'M50 3C79 3 97 47 97 80c0 28-20 45-47 45S3 108 3 80C3 47 21 3 50 3z';
const GREEN = '#1d5c2f', CREAM = '#fbf1d8', YELLOW = '#f6bf1f';

/** Draws the logo with its top-left corner at (x, y), h pixels tall (width = h * 0.78). */
export function drawLogo(ctx, x, y, h) {
  const s = h / 128;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const egg = new Path2D(EGG);
  ctx.fillStyle = GREEN;
  ctx.fill(egg);
  ctx.save();
  ctx.clip(egg);
  ctx.fillStyle = CREAM;
  ctx.fill(new Path2D('M29 9C20 23 10 41 8 57c-2 14 10 24 32 26 20 2 40 0 58-7-9-4-15-12-18-20L66 30c-10-8-20-4-22 6-6-6-12-15-15-27z'));
  ctx.beginPath();
  ctx.arc(63, 41, 16.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = YELLOW;
  ctx.fill(new Path2D('M26.5 19C19 32 13.5 45 13.5 56.5c.5 11 13 17 33 18 15 1 28-.5 39-2-8-4-13-9-17-15-8 2-16 0-22-6-8-8-15-19-19.5-32.5z'));
  const leaf = new Path2D('M41 114c11-15 30-25 55-28-8 16-27 27-55 28z');
  ctx.fillStyle = GREEN;
  ctx.fill(leaf);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 3;
  ctx.lineJoin = ctx.lineCap = 'round';
  ctx.stroke(leaf);
  ctx.stroke(new Path2D('M11 103c10-7 21-10 33-11'));
  ctx.restore();
  ctx.fillStyle = YELLOW;
  ctx.fill(new Path2D('M78.5 36.5l11 4.5-10.5 5.5z'));
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D('M60.5 37q5-5.5 10 0'));
  ctx.restore();
}
