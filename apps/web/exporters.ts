/** 浏览器侧导出工具：下载、SVG 转 PNG、打印。 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG 渲染失败'));
      image.src = url;
    });

    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建离屏画布');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG 编码失败'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printSvg(svg: string, title: string): void {
  const win = window.open('', '_blank', 'width=1000,height=760');
  if (!win) throw new Error('打印窗口被浏览器拦截');

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${title.replace(/[<>&]/g, '')}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  html,body{margin:0;padding:0;background:#fff}
  .sheet{display:flex;align-items:center;justify-content:center;min-height:100vh}
  svg{max-width:100%;max-height:96vh;height:auto}
</style></head><body><div class="sheet">${svg}</div>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},160);});</script>
</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
