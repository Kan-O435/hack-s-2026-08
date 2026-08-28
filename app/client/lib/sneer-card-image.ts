import type { SneerCard } from "@/lib/rooms";

const CARD_WIDTH = 900;
const PHOTO_HEIGHT = 660;
const PADDING = 44;
const CORNER_RADIUS = 28;

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

// 日本語は単語間にスペースが無いため、幅が収まらなくなった時点で1文字ずつ折り返す
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = img.width / img.height;
  const boxRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = img.width;
  let sourceHeight = img.height;

  if (imageRatio > boxRatio) {
    sourceWidth = img.height * boxRatio;
    sourceX = (img.width - sourceWidth) / 2;
  } else {
    sourceHeight = img.width / boxRatio;
    sourceY = (img.height - sourceHeight) / 2;
  }

  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("写真の読み込みに失敗しました");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("写真のデコードに失敗しました"));
      el.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// カード(写真+ニックネーム+引用+講評+日付)を1枚の画像に合成する。
// InstagramやAirDropはURLではなく画像ファイルを渡す必要があるため、
// 図鑑の1カード分をそのまま共有できる形にするにはこの合成が要る。
export async function buildSneerShareCard(card: SneerCard): Promise<Blob> {
  const img = await loadImageElement(card.photo_url);

  // 実際の描画前に、文字量に応じた最終的な高さを測るための仮コンテキスト
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) throw new Error("このブラウザはcanvasに対応していません");

  const contentWidth = CARD_WIDTH - PADDING * 2;

  measureCtx.font = "bold 36px sans-serif";
  const quoteText = `「${card.utterance.cringe_phrase || card.utterance.transcript}」`;
  const quoteLines = wrapText(measureCtx, quoteText, contentWidth - 24);
  const quoteLineHeight = 48;

  let reasonLines: string[] = [];
  const reasonLineHeight = 38;
  if (card.utterance.cringe_reason) {
    measureCtx.font = "26px sans-serif";
    reasonLines = wrapText(measureCtx, card.utterance.cringe_reason, contentWidth);
  }

  const nicknameBlockHeight = 56 + 56; // ニックネーム行 + ルーム名行
  const quoteBlockHeight = quoteLines.length * quoteLineHeight + 24;
  const reasonBlockHeight = reasonLines.length > 0 ? reasonLines.length * reasonLineHeight + 24 : 0;
  const footerBlockHeight = 70;

  const textAreaHeight =
    PADDING + nicknameBlockHeight + quoteBlockHeight + reasonBlockHeight + footerBlockHeight;
  const cardHeight = PHOTO_HEIGHT + textAreaHeight;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = cardHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("このブラウザはcanvasに対応していません");

  roundedRectPath(ctx, 0, 0, CARD_WIDTH, cardHeight, CORNER_RADIUS);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_WIDTH, cardHeight);

  drawCover(ctx, img, 0, 0, CARD_WIDTH, PHOTO_HEIGHT);

  ctx.textBaseline = "top";
  let y = PHOTO_HEIGHT + PADDING;

  ctx.fillStyle = "#111111";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(card.speaker.nickname, PADDING, y);

  if (card.utterance.cringe_score != null) {
    const badgeText = `冷笑度 ${card.utterance.cringe_score}`;
    ctx.font = "bold 28px sans-serif";
    const badgeTextWidth = ctx.measureText(badgeText).width;
    const badgeWidth = badgeTextWidth + 40;
    const badgeHeight = 56;
    const badgeX = CARD_WIDTH - PADDING - badgeWidth;
    const badgeY = y - 6;
    roundedRectPath(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 10);
    ctx.fillStyle = "#111111";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, badgeX + 20, badgeY + 14);
  }

  y += 56;
  ctx.fillStyle = "#777777";
  ctx.font = "26px sans-serif";
  ctx.fillText(card.room.name, PADDING, y);

  y += 56;
  ctx.fillStyle = "#111111";
  ctx.fillRect(PADDING, y + 4, 6, quoteLines.length * quoteLineHeight - 8);
  ctx.font = "bold 36px sans-serif";
  quoteLines.forEach((line, index) => {
    ctx.fillText(line, PADDING + 24, y + index * quoteLineHeight);
  });
  y += quoteBlockHeight;

  if (reasonLines.length > 0) {
    ctx.fillStyle = "#666666";
    ctx.font = "26px sans-serif";
    reasonLines.forEach((line, index) => {
      ctx.fillText(line, PADDING, y + index * reasonLineHeight);
    });
    y += reasonBlockHeight;
  }

  const footerY = y + 24;
  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, footerY);
  ctx.lineTo(CARD_WIDTH - PADDING, footerY);
  ctx.stroke();

  const capturedAt = card.snapshot_captured_at ?? card.utterance.spoken_at;
  ctx.fillStyle = "#999999";
  ctx.font = "22px sans-serif";
  ctx.fillText(new Date(capturedAt).toLocaleString("ja-JP"), PADDING, footerY + 20);

  ctx.textAlign = "right";
  ctx.fillText("冷笑図鑑", CARD_WIDTH - PADDING, footerY + 20);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像の生成に失敗しました"))),
      "image/jpeg",
      0.92,
    );
  });
}
