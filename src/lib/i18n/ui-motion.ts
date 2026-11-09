export function uiMotionCopy(english: boolean) {
  return english ? {
    title: 'Motion effects', help: 'Turning effects off may improve smoothness and save battery on less powerful devices.',
    on: 'On', off: 'Off'
  } : {
    title: 'Hiệu ứng chuyển động', help: 'Tắt hiệu ứng có thể giúp ứng dụng mượt hơn và tiết kiệm pin trên thiết bị cấu hình thấp.',
    on: 'Bật', off: 'Tắt'
  };
}
