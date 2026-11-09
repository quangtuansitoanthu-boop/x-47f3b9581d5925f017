import { createRosaryWater } from './rosary-water';

/** Dùng chung sóng nước; chỉ lấy nền hiển thị, không đọc/ghi trạng thái phiên thiền. */
export function createMeditationWater(area: HTMLElement, canvas: HTMLCanvasElement) {
  return createRosaryWater(area, canvas, {
    canStartPointer(event) {
      return !(event.target instanceof Element && event.target.closest('button, input, select, textarea, a, .meditation-background-picker'));
    },
    paintBackground(context, bounds) {
      const style = getComputedStyle(area);
      const colors = style.backgroundImage.match(/rgba?\([^)]+\)/g);
      context.clearRect(0, 0, bounds.width, bounds.height);
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, bounds.width, bounds.height);
      if (colors?.length === 3) {
        const x = bounds.width * .5;
        const y = bounds.height * .35;
        const radius = Math.hypot(x, Math.max(y, bounds.height - y));
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        colors.forEach((color, index) => gradient.addColorStop([0, .46, 1][index], color));
        context.fillStyle = gradient;
        context.fillRect(0, 0, bounds.width, bounds.height);
      }
      const photo = area.querySelector<HTMLImageElement>('.meditation-screen__photo img');
      if (photo?.complete && photo.naturalWidth && photo.naturalHeight) {
        const scale = Math.max(bounds.width / photo.naturalWidth, bounds.height / photo.naturalHeight);
        const width = photo.naturalWidth * scale;
        const height = photo.naturalHeight * scale;
        context.drawImage(photo, (bounds.width - width) / 2, (bounds.height - height) / 2, width, height);
        context.fillStyle = getComputedStyle(photo.parentElement!, '::after').backgroundColor;
        context.fillRect(0, 0, bounds.width, bounds.height);
      }
    },
  });
}
