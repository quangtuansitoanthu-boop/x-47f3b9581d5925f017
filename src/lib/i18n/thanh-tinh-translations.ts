export interface ThanhTinhTranslationSchema {
  storageError: string;
  conductLinkError: string;
  retryConductLink: string;
  header: {
    title: string;
    subtitle: string;
    back: string;
  };
  onboarding: {
    badge: string;
    heading: string;
    question: string;
    subtext: string;
    joinBtn: string;
    backBtn: string;
    privacy: string;
  };
  tabs: {
    overview: string;
    progress: string;
    sos: string;
    audio: string;
    diet: string;
    repentance: string;
  };
  overview: {
    relapseWarningTitle: string;
    relapseWarningText: string;
    recoveryProgressLabel: string;
    recoveryStatus: (current: number) => string;
    abstinenceAlert: (title: string, harm: string) => string;
    communityPractitioners: string;
    communityUrgesResisted: string;
    pledgeCta: string;
    pledgeStatus: string;
    privacyNote: string;
    streakKicker: string;
    daysLabel: string;
    hoursLabel: string;
    minutesLabel: string;
    secondsLabel: string;
    nextGoalLabel: string;
    maxGoalReached: string;
    checkInDone: string;
    checkInAction: string;
    emergencySosCta: string;
    relapseCta: string;
    checkInRuleTitle: string;
    checkInRuleText: string;
    longestStreakLabel: string;
    resistedCountLabel: string;
    startedFromLabel: string;
    adjustDateAction: string;
    adjustDateTitle: string;
  };
  progress: {
    heading: string;
    subheading: string;
    currentStreak: string;
    currentMilestoneLabel: string;
    nextTargetLabel: string;
    daysRemaining: (days: number) => string;
    maxPerfection: string;
    pctToNext: (pct: number) => string;
    badgeCurrent: string;
    badgeUnlocked: string;
    badgeLocked: (days: number) => string;
    daysUnit: string;
  };
  sos: {
    alarmTitle: string;
    alarmDesc: (mins: string, secs: string) => string;
    muteSiren: string;
    sirenStoppedNote: string;
    restartSiren: string;
    bannerTitle: string;
    bannerSubtitle: string;
    strikeBowlBtn: string;
    step1Num: string;
    step1Title: string;
    step1Desc: string;
    witnessBuddhaTitle: string;
    witnessBuddhaDesc: string;
    witnessDevaTitle: string;
    witnessDevaDesc: string;
    witnessAncestorsTitle: string;
    witnessAncestorsDesc: string;
    witnessDemonsTitle: string;
    witnessDemonsDesc: string;
    consequencesBadge: string;
    consequencesTitle: string;
    consequencesIntro: string;
    card1Title: string;
    card1Tag: string;
    card1Points: string[];
    card2Title: string;
    card2Tag: string;
    card2Points: string[];
    card3Title: string;
    card3Tag: string;
    card3Points: string[];
    awakenCallout: string;
    step2Num: string;
    step2Title: string;
    step2Desc: string;
    phys1Title: string;
    phys1Desc: string;
    phys2Title: string;
    phys2Desc: string;
    phys3Title: string;
    phys3Desc: string;
    squatCounterTitle: string;
    squatCounterDesc: string;
    squatAdd5: string;
    squatAdd1: string;
    squatReset: string;
    step3Num: string;
    step3Title: string;
    step3Desc: string;
    listenAudioCta: string;
    heartMantraTitle: string;
    heartMantraContent: string;
    resistedSuccessBtn: string;
    resistedSuccessDesc: string;
    resistedSuccessAlert: string;
    surrenderBtn: string;
    completionAlert: string;
  };
  audio: {
    screenTitle: string;
    tabOverview: string;
    tabProgress: string;
    tabSos: string;
    tabAudio: string;
    nameLine1: string;
    nameLine2: string;
    remainingLabel: string;
    sessionLabel: (mins: number) => string;
    seekAria: string;
    loopLabel: string;
    kicker: string;
    title: string;
    desc: string;
    timerRemaining: (time: string) => string;
    timerRecommended: (mins: number) => string;
    loopOn: string;
    loopOff: string;
    loopActiveTitle: string;
    loopInactiveTitle: string;
    pauseBtn: string;
    playBtn: string;
    volumeAria: string;
    timerSelectorLabel: string;
    timerUnlimited: string;
    timerMins: (m: number) => string;
    storyTitle: string;
    storyP1: string;
    storyP2: string;
    reciteScriptureBtn: string;
  };
  diet: {
    title: string;
    subtitle: string;
    badgeLimit: string;
    meatTitle: string;
    meatDesc: string;
    badgeRecommend: string;
    veganTitle: string;
    veganDesc: string;
    badgeForbidden: string;
    pungentTitle: string;
    pungentDesc: string;
    lifestyleTitle: string;
    rule1Title: string;
    rule1Desc: string;
    rule2Title: string;
    rule2Desc: string;
    rule3Title: string;
    rule3Desc: string;
  };
  repentance: {
    title: string;
    subtitle: string;
    quote: string;
    ritualTitle: string;
    invocations: string[];
    ritualP1: string;
    ritualP2: string;
    ritualP3: string;
    ritualClosing: string;
    recoveryHeading: string;
    recStep1: string;
    recStep2: string;
    recStep3: string;
    resetStreakCta: string;
  };
  modals: {
    pledgeTitle: string;
    pledgeIntro: (count: string) => string;
    pledgeVow: string;
    pledgePrivacy: string;
    pledgeCancel: string;
    pledgeConfirm: string;
    relapseTitle: string;
    relapseIntro: string;
    relapseReasonLabel: string;
    relapseReasons: Array<{ label: string; value: string }>;
    relapseNoteLabel: string;
    relapseNotePlaceholder: string;
    relapseCancel: string;
    relapseConfirm: string;
    checkInTitle: string;
    checkInQuestion: string;
    checkInWarning: string;
    checkInConfirm: string;
    checkInCancel: string;
    adjustTitle: string;
    adjustIntro: string;
    adjustDateLabel: string;
    adjustPrivacy: string;
    adjustCancel: string;
    adjustConfirm: string;
  };
}

export const thanhTinhTranslations: { vi: ThanhTinhTranslationSchema; en: ThanhTinhTranslationSchema } = {
  vi: {
    storageError: 'Chưa lưu được trên thiết bị. Vui lòng thử lại; tiến độ cũ vẫn được giữ nguyên.',
    conductLinkError: 'Điểm danh đã được lưu, nhưng chưa liên kết được với Giữ giới thanh tịnh. Bạn có thể thử liên kết lại.',
    retryConductLink: 'Thử liên kết lại',
    header: {
      title: 'Tiết dục bảo thân',
      subtitle: 'Cai nghiện thủ dâm, tiết chế tình dục',
      back: 'Quay lại',
    },
    onboarding: {
      badge: '🛡️',
      heading: 'CHƯƠNG TRÌNH TIẾT DỤC BẢO THÂN',
      question: 'Bạn muốn tham gia chương trình cai nghiện thủ dâm và tiết chế tình dục?',
      subtext: 'Chương trình giúp bạn khởi động hành trình phục hồi nguyên khí, theo dõi chuỗi ngày giữ giới thanh tịnh, nhắc nhở ngày kiêng cữ quan trọng và cung cấp công cụ dập tắt dục hỏa khẩn cấp.',
      joinBtn: '✓ CÓ, TÔI MUỐN THAM GIA NGAY',
      backBtn: 'Để sau (Quay lại)',
      privacy: '🔒 Hoàn toàn bảo mật & ẩn danh. Dữ liệu đếm ngày lưu trực tiếp trên thiết bị của bạn.',
    },
    tabs: {
      overview: 'Tổng Quan',
      progress: 'Tiến Độ Của Tôi',
      sos: 'Cứu Nguy Dập Hỏa',
      audio: 'Nghe Chú 15 Phút',
      diet: 'Ăn uống và sinh hoạt',
      repentance: 'Sám hối và bắt đầu lại',
    },
    overview: {
      relapseWarningTitle: 'CẢNH BÁO SAU KHI SA NGÃ — NỖ LỰC ĐỨNG LÊN!',
      relapseWarningText: 'Vấp ngã là bài học để rèn luyện tâm tính kiên định hơn, không được nản chí hay buông xuôi! Hãy nỗ lực đoạn trừ niệm dâm, kiên trì giữ vững thân tâm và hoàn thành 2 ngày liên tục điểm danh thành công để phục hồi định lực và xóa thông báo này.',
      recoveryProgressLabel: 'Tiến độ phục hồi định lực:',
      recoveryStatus: (current: number) => `${current} / 2 ngày điểm danh liên tục`,
      abstinenceAlert: (title: string, harm: string) => `Ngày hôm nay thuộc ${title}... nếu bạn thủ dâm hoặc không kiêng quan hệ vợ chồng sẽ bị ${harm}.`,
      communityPractitioners: 'Bạn đồng tu đang cùng phát nguyện',
      communityUrgesResisted: 'Cơn dục đã được đại chúng dập tắt',
      pledgeCta: '🙏 Tôi Xin Phát Nguyện Giữ Giới Cùng Đại Chúng',
      pledgeStatus: 'Bạn đang đồng hành giữ giới thanh tịnh cùng đại chúng (Ẩn danh 100%)',
      privacyNote: '🔒 Bảo mật tuyệt đối: Hệ thống chỉ hiển thị tổng số lượng để tiếp thêm định lực cho nhau. Thông tin cá nhân của bạn hoàn toàn ẩn danh.',
      streakKicker: 'CHUỖI ĐIỂM DANH LIÊN TIẾP',
      daysLabel: 'NGÀY',
      hoursLabel: 'giờ',
      minutesLabel: 'phút',
      secondsLabel: 'giây',
      nextGoalLabel: 'Mục tiêu tiếp theo:',
      maxGoalReached: 'Đã đạt quả vị tối thượng! 🏆',
      checkInDone: '✓ Hôm nay bạn đã điểm danh thanh tịnh',
      checkInAction: '🙏 Điểm danh: Hôm nay tôi đã giữ trọn thanh tịnh',
      emergencySosCta: '🚨 CỨU NGUY KHẨN CẤP (DẬP TẮT DỤC HỎA)',
      relapseCta: '🕊️ Lỡ sa ngã? Đặt lại & Sám hối',
      checkInRuleTitle: 'Quy tắc tính chuỗi điểm danh:',
      checkInRuleText: 'Mỗi ngày theo giờ Việt Nam chỉ được tính một lần khi bạn xác nhận điểm danh; đồng hồ giờ, phút, giây không tự cộng thêm ngày. Bỏ lỡ một ngày thì chuỗi về 0, đồng hồ dừng ở 00:00:00. Khi điểm danh lại, chuỗi bắt đầu từ 1 ngày và đồng hồ chạy lại từ 00:00:00. Không tự ghi nhận sa ngã và không xóa lịch sử cũ.',
      longestStreakLabel: 'Chuỗi dài nhất:',
      resistedCountLabel: 'Số lần vượt ải thành công:',
      startedFromLabel: '🗓️ Bắt đầu từ:',
      adjustDateAction: '(Chỉnh)',
      adjustDateTitle: 'Chỉnh lại ngày bắt đầu nếu bạn đã giữ giới trước khi dùng ứng dụng',
    },
    progress: {
      heading: 'Tiến Độ & 17 Cột Mốc Chuyển Hóa (Đến 20 Năm)',
      subheading: 'Theo dõi từng bước phục hồi nguyên khí và định lực trên hành trình giữ giới thanh tịnh.',
      currentStreak: 'Chuỗi ngày hiện tại:',
      currentMilestoneLabel: 'Cột mốc đang đạt:',
      nextTargetLabel: 'Mục tiêu kế tiếp:',
      daysRemaining: (days: number) => `còn ${days} ngày`,
      maxPerfection: '🏆 Đạt quả vị viên mãn cao nhất!',
      pctToNext: (pct: number) => `${pct}% đến mốc tiếp theo`,
      badgeCurrent: '⭐ MỐC HIỆN TẠI',
      badgeUnlocked: '✓ ĐÃ ĐẠT',
      badgeLocked: (days: number) => `🔒 Còn ${days} ngày`,
      daysUnit: 'ngày',
    },
    sos: {
      alarmTitle: 'CẢNH BÁO KHẨN CẤP: DẬP TẮT DỤC HỎA NGAY LẬP TỨC!',
      alarmDesc: (mins: string, secs: string) => `Đang tự động phát còi báo động thức tỉnh (${mins}:${secs}) & tiếng chuông ngân. Giữ vững chánh niệm, không được chạm vào thân thể!`,
      muteSiren: '🔇 Tắt Còi Báo Động',
      sirenStoppedNote: 'Còi báo động đã tắt. Nếu dục hỏa vẫn còn thôi thúc, hãy bấm để kích hoạt lại còi báo động:',
      restartSiren: '🚨 Kích Hoạt Lại Còi Báo Động Thức Tỉnh (2 Phút)',
      bannerTitle: 'DỪNG LẠI NGAY! BẠN KHÔNG HỀ Ở MỘT MÌNH!',
      bannerSubtitle: 'Dục vọng chỉ là ảo giác hóa học nhất thời kéo dài 10 - 15 phút. Hãy lập tức thực hiện 3 pháp phương dưới đây để dập tắt dục hỏa!',
      strikeBowlBtn: '🔔 Dóng 3 Tiếng Chuông Bát Ngân',
      step1Num: '1',
      step1Title: 'TÂM PHÁP CẢNH TỈNH (Phá Tan Ảo Tưởng Một Mình)',
      step1Desc: 'Nhận diện sự thật tâm linh để thức tỉnh lương tri và lòng tự trọng (Tàm Quý)',
      witnessBuddhaTitle: 'MƯỜI PHƯƠNG CHƯ PHẬT & BỒ TÁT',
      witnessBuddhaDesc: 'Tuệ nhãn chư Phật thấy rõ từng khởi tâm động niệm của bạn dù ở trong phòng kín tối tăm. Các ngài xót thương cho sự mê muội làm tiêu hao công đức và linh tánh của bạn.',
      witnessDevaTitle: 'CHƯ VỊ HỘ PHÁP & THIỆN THẦN',
      witnessDevaDesc: 'Các ngài luôn túc trực bảo hộ người lành. Khi bạn buông thả dâm niệm, mùi hôi uế bốc lên khiến chư Thiên Thiện Thần buồn bã che mặt quay đi, mất sạch hào quang che chở.',
      witnessAncestorsTitle: 'CỬU HUYỀN THẤT TỔ & TỔ TIÊN',
      witnessAncestorsDesc: 'Vong linh ông bà, cha mẹ nhiều đời đang đứng quanh nhìn bạn với nỗi đau đớn xót xa và hổ thẹn với quỷ thần vì con cháu suy đồi, tiêu tán phước ấm gia tộc.',
      witnessDemonsTitle: 'QUỶ THẦN & MA HÚT TINH KHÍ',
      witnessDemonsDesc: 'Loài "Hấp tinh quỷ" đang chực chờ quanh bạn phát ra tà khí, chỉ chờ bạn tiết tinh buông thả để lao vào nuốt trọn nguyên khí, khiến bạn thân tàn ma dại, vận đen bủa vây.',
      consequencesBadge: '⚖️ MINH BẠCH NHÂN QUẢ',
      consequencesTitle: 'NẾU BẠN PHẠM PHẢI THỦ DÂM, TÀ DÂM, NGOẠI TÌNH THÌ HẬU QUẢ RA SAO?',
      consequencesIntro: 'Cổ đức dạy: "Vạn ác dâm vi thủ" (Trong muôn điều ác, tà dâm đứng đầu). Khoái cảm chỉ tồn tại vài giây, nhưng cái giá phải trả theo luật nhân quả là vô cùng khủng khiếp:',
      card1Title: 'NẾU BẠN THỦ DÂM (Tự sướng, xem phim khiêu dâm):',
      card1Tag: 'Hại Thân Thể & Tiêu Hao Trí Lực',
      card1Points: [
        'Tàn phá tạng phủ: Một giọt tinh mười giọt máu. Xuất tinh bừa bãi làm cạn kiệt tủy sống, não bộ teo tóp, thận âm thận dương suy kiệt; sinh ra đau lưng mỏi gối, ù tai mờ mắt, tóc bạc sớm rụng nhiều, hơi thở và thân thể toát ra mùi hôi hám.',
        'Thần sắc bại hoại, người khác khinh thường: Mặt mũi tối tăm ám muội, mắt vô thần lờ đờ, tướng mạo đê tiện hèn nhát; đứng trước người khác tự nhiên mất uy lực, nói không ai tin, làm gì cũng bị người đời xa lánh ghét bỏ.',
        'Công danh tiêu tán, học hành bế tắc: Trí nhớ suy giảm trầm trọng, não bộ luôn mơ màng đần độn (brain fog), mất khả năng tư duy sáng tạo; thi cử trắc trở, phỏng vấn xin việc thất bại, tiền tài hao tán bất ngờ, tài lộc chảy vào đều bị thủng đáy.',
        'Tâm thần thác loạn: Luôn sống trong sợ hãi, lo âu, tự ghê tởm chính mình; dễ mắc chứng rối loạn lo âu, trầm cảm, hoang tưởng, ý chí bạc nhược không làm nên nghiệp lớn.'
      ],
      card2Title: 'NẾU BẠN TÀ DÂM (Sống buông thả, quan hệ trước hôn nhân, gạ gẫm tà ý):',
      card2Tag: 'Mất Sạch Phúc Đức & Đứt Gãy Duyên Lành',
      card2Points: [
        'Tổn hại danh tiết & Lây truyền tật bệnh: Tự bôi tro trát trấu vào phẩm hạnh, dễ lây nhiễm các chứng bệnh xã hội hiểm nghèo, lở loét ô uế, mang tiếng xấu nhơ nhớp muôn đời làm hổ thẹn cha mẹ tông tộc.',
        'Đường tình duyên lận đận, hôn nhân bất hạnh: Người phạm tà dâm thường chiêu cảm bạn đời trăng hoa, dối trá, phản bội; hôn nhân sau này luôn nghi kỵ cãi vã, con cái sinh ra khó nuôi, ốm yếu hoặc ngỗ nghịch bất hiếu khó dạy bảo.',
        'Thiện Thần lìa xa, Ma Quỷ bu bám: Mùi hôi uế của tà niệm khiến chư Thiên Hộ Pháp buồn bã quay lưng bỏ đi; loài ngạ quỷ hấp tinh khí lập tức đeo bám quấy nhiễu, làm cho vận khí suy sụp, tai nạn bất ngờ, xui xẻo liên miên không dứt.',
        'Tổn phước cực nhanh: Phước đức tu tập tích lũy từ nhiều đời bị ngọn lửa tà dâm thiêu rụi nhanh chóng, người vốn có số làm quan hóa thành bần cùng, người có số giàu sang hóa thành cùng khổ bế tắc.'
      ],
      card3Title: 'NẾU BẠN NGOẠI TÌNH (Phản bội vợ chồng, quan hệ với người có gia đình):',
      card3Tag: 'Trọng Tội Phá Hoại Gia Can & Địa Ngục Hiện Tiền',
      card3Points: [
        'Đại tội phá hoại luân thường đạo lý: Đâm nhát dao chí mạng vào niềm tin của người đầu ấp tay gối; làm cha mẹ hai bên nhục nhã ê chề, con cái vô tội phải chịu cảnh bơ vơ ly tán, vết thương lòng rỉ máu suốt cả cuộc đời.',
        'Hiện đời thân bại danh liệt, tán gia bại sản: Dễ vướng vào vòng lao lý kiện tụng, đánh ghen nhục nhã phơi bày khắp thiên hạ; mất sạch sự nghiệp, chức vị, bị xã hội lên án khinh bỉ; gia tài khánh kiệt, thậm chí xảy ra án mạng đẫm máu.',
        'Tổn hại phúc ấm con cháu: Nghiệp báo ngoại tình làm tiêu tan phúc đức tổ tiên để lại; con cái đời sau khó thành đạt, dễ lặp lại số phận bị phản bội đau đớn như cha mẹ chúng từng gây ra.',
        'Quả báo đọa lạc ba đường ác: Kinh Phật dạy: Kẻ gian dâm phá hoại gia cang người khác khi chết đọa thẳng vào địa ngục Đồng Trụ (ôm cột đồng đỏ rực thiêu đốt da thịt) và địa ngục Thiết Sàng (nằm trên giường sắt nóng sôi sục), chịu muôn vạn nỗi thống khổ hàng triệu kiếp mới mong dứt nghiệp!'
      ],
      awakenCallout: '🔥 HÃY TỈNH NGỘ NGAY TRƯỚC KHI QUÁ MUỘN: Mỗi giây phút kìm nén vượt qua dục vọng hôm nay là bạn đang tích lũy công đức vô lượng, bảo toàn chân khí, thọ mạng và phúc trạch cho bản thân cùng con cháu đời sau!',
      step2Num: '2',
      step2Title: 'THÂN PHÁP HẠ HỎA (Biện Pháp Vật Lý Dập Lửa Cấp Kỳ)',
      step2Desc: 'Chuyển hướng dòng máu và hạ nhiệt thần kinh trung ương ngay lập tức',
      phys1Title: '1. Chườm đá lạnh lên trán & mặt',
      phys1Desc: 'Lấy ngay 2 - 3 viên đá lạnh (hoặc khăn ướp đá) chườm trực tiếp vào trán, hai thái dương và sau gáy. Phản xạ lạnh làm co mạch máu não lập tức hạ nhiệt và dập tắt cơn bốc hỏa sinh lý.',
      phys2Title: '2. Tắm nước mát hoặc dội nước',
      phys2Desc: 'Bước ngay vào nhà tắm, dội nước lạnh từ đỉnh đầu xuống hoặc xối nước mát vào vùng hạ bộ. Cú sốc nhiệt tích cực sẽ kéo hệ thần kinh giao cảm về trạng thái tĩnh chỉ.',
      phys3Title: '3. Rời khỏi giường & phòng kín',
      phys3Desc: 'Mở toang cửa sổ, bật sáng hết đèn trong phòng, bước ra phòng khách hoặc ra hành lang. Tuyệt đối không nằm một mình trên giường với điện thoại!',
      squatCounterTitle: 'BỘ ĐẾM 100 CÁI ĐỨNG LÊN NGỒI XUỐNG (SQUAT) TIÊU HỎA',
      squatCounterDesc: 'Ép toàn bộ máu và năng lượng từ hạ bộ dồn về cơ đùi lớn, xua tan hoàn toàn cảm giác ham muốn.',
      squatAdd5: '+5 cái',
      squatAdd1: '+1 cái',
      squatReset: 'Đặt lại',
      step3Num: '3',
      step3Title: 'KHẨU PHÁP HÀNG MA (Trì Niệm Chú Lăng Nghiêm & Quán Âm)',
      step3Desc: 'Dùng âm thanh oai thần của Phật chú để tống khứ tà niệm',
      listenAudioCta: '🎧 ĐEO TAI NGHE & BẬT NGHE CHÚ LĂNG NGHIÊM 15 PHÚT NGAY',
      heartMantraTitle: 'TÂM CHÚ LĂNG NGHIÊM (ĐỌC LIÊN TỤC 21 LẦN):',
      heartMantraContent: '"Đát điệt tha: Án, a na lệ, tỳ xá đề, bệ ra bạt xà ra đà rị, bàn đà bàn đà nễ, bạt xà ra báng ni phấn, hổ hồng đô rô ung phấn, ta bà ha."',
      resistedSuccessBtn: '✓ TÔI ĐÃ VƯỢT QUA CƠN DỤC VỌNG AN TOÀN! 🙏',
      resistedSuccessDesc: 'Bấm xác nhận để ghi nhận 1 lần chiến thắng oanh liệt và củng cố thêm sức mạnh cho cộng đồng.',
      resistedSuccessAlert: 'Tán thán đại đức! Bạn vừa vượt qua một cơn dục hỏa mãnh liệt. Định lực và phước đức của bạn đã tăng trưởng vượt bậc! 🙏',
      surrenderBtn: '💔 TÔI LỠ SA NGÃ / KHÔNG VƯỢT QUA ĐƯỢC CƠN DỤC (THỦ DÂM)',
      completionAlert: 'Đã hoàn thành 15 phút nghe Chú Lăng Nghiêm dập tắt dục hỏa! Thân tâm bạn giờ đây đã thanh tịnh và an lành. 🙏',
    },
    audio: {
      screenTitle: 'Tiết dục bảo thân',
      tabOverview: 'Tổng quan',
      tabProgress: 'Tiến độ',
      tabSos: 'Vượt qua thôi thúc',
      tabAudio: 'Nghe chú',
      nameLine1: 'Nam mô Đại trí Văn Thù',
      nameLine2: 'Sư Lợi Bồ Tát',
      remainingLabel: 'Còn lại',
      sessionLabel: (mins: number) => `Phiên nghe ${mins} phút`,
      seekAria: 'Vị trí phát',
      loopLabel: 'Lặp lại',
      kicker: 'PHÁP BẢO ĐOẠN TRỪ DỤC HỎA ĐỆ NHẤT',
      title: 'Thần Chú Lăng Nghiêm',
      desc: 'Bạn nên đeo tai nghe vào nhiếp tâm theo lời tụng chú nghe ít nhất 15 phút',
      timerRemaining: (time: string) => `Thời gian còn lại trong phiên: ${time}`,
      timerRecommended: (mins: number) => `Hẹn giờ khuyến nghị: ${mins} phút dập tắt dục hỏa`,
      loopOn: '🔁 Lặp liên tục: BẬT',
      loopOff: '🔁 Lặp liên tục: TẮT',
      loopActiveTitle: 'Đang bật lặp lại liên tục',
      loopInactiveTitle: 'Tắt lặp lại',
      pauseBtn: 'Tạm dừng',
      playBtn: 'Phát chú Lăng Nghiêm',
      volumeAria: 'Âm lượng',
      timerSelectorLabel: 'Hẹn giờ',
      timerUnlimited: 'Không giới hạn',
      timerMins: (m: number) => `${m} phút`,
      storyTitle: 'Duyên Khởi Cứu Nạn Ma Đăng Già & Sự Kỳ Diệu Của Chú Lăng Nghiêm',
      storyP1: 'Trong hội Lăng Nghiêm, Tôn giả A-Nan đi khất thực một mình, bị nàng Ma-Đăng-Già dùng thần chú tà thuật Ta-Tỳ-Ca-La mê hoặc, dẫn vào phòng kín suýt chút nữa làm hoại giới thể thanh tịnh. Đức Phật ở tịnh xá liền từ trên đỉnh đảnh phóng hào quang bách bảo vô úy, sai Bồ Tát Văn Thù Sư Lợi mang Thần Chú Lăng Nghiêm đến nơi phá tan tà thuật, dập tắt lửa dâm ái cứu ngài A-Nan thoát nạn.',
      storyP2: 'Bởi vậy, Chú Lăng Nghiêm là thần chú hàng ma phục dục số 1 trong Phật giáo. Người nào kiên trì nghe và trì tụng thường xuyên mỗi ngày, sau 21 đến 100 ngày sẽ cảm nhận rõ ràng lòng dâm dục tiêu trừ, tâm trí trong sáng như ngọc bích.',
      reciteScriptureBtn: '📿 TRÌ CHÚ NGAY (Nghi Thức Tu Tập Chú Lăng Nghiêm) →',
    },
    diet: {
      title: 'Chế Độ Ăn Uống & Lối Sống Tiết Dục',
      subtitle: 'Khí huyết bắt nguồn từ ẩm thực. Ăn uống thanh đạm là nền tảng vững chắc nhất để dập tắt dục hỏa từ gốc rễ sinh học.',
      badgeLimit: 'HẠN CHẾ TỐI ĐA',
      meatTitle: '🥩 Hạn Chế Thịt Động Vật Tính Nhiệt',
      meatDesc: 'Thịt đỏ (bò, chó, dê, cừu) và các loại thịt thú chứa hàm lượng protein động vật có tính dương nhiệt cực cao. Ăn nhiều thịt làm kích thích hormone testosterone và tinh khí bốc hỏa, khiến tâm luôn bứt rứt, dễ sinh tà niệm.',
      badgeRecommend: 'KHUYÊN DÙNG TỐT NHẤT',
      veganTitle: '🌿 Ăn Chay Thanh Tịnh Là Tốt Nhất',
      veganDesc: 'Thực phẩm từ thực vật (rau củ, đậu hũ, ngũ cốc nguyên cám, hạt chia, óc chó...) có tính chất thanh lương, lọc sạch độc tố trong máu, giúp tinh thần hòa ái, dâm hỏa tự nhiên lắng dịu một cách kỳ diệu.',
      badgeForbidden: 'TUYỆT ĐỐI KIÊNG CỮ',
      pungentTitle: '🧄 Kiêng Ngũ Vị Tân (Hành, Hẹ, Tỏi, Kiệu, Củ Nén)',
      pungentDesc: 'Đức Phật dạy rõ trong Kinh Lăng Nghiêm: Năm món ngũ tân này "ăn chín thì sinh dâm dục, ăn sống thì dễ nổi giận sân hận". Chúng sinh ra mùi xú uế kích thích tà niệm, khiến thiện thần xa lánh, ngạ quỷ bu bám.',
      lifestyleTitle: '🌙 3 Nguyên Tắc Vàng Trong Sinh Hoạt Hàng Ngày',
      rule1Title: '1. Tuyệt đối không đem điện thoại lên giường ngủ trong bóng tối:',
      rule1Desc: '95% trường hợp sa ngã xảy ra khi nằm một mình lướt điện thoại lúc đêm muộn. Hãy sạc điện thoại ở bàn xa giường trước khi đi ngủ.',
      rule2Title: '2. Đi ngủ trước 22h30:',
      rule2Desc: 'Từ 23h đến 1h sáng (giờ Tý) là lúc thận khí chuyển giao và dễ bị dục vọng cám dỗ nhất. Ngủ sớm giúp hồi phục tinh lực và tạng thận khỏe mạnh.',
      rule3Title: '3. Sáng dậy sớm tập thể dục, hít thở khí trời:',
      rule3Desc: 'Dậy sớm tập squat, chạy bộ hoặc hít đất giúp khí huyết lưu thông toàn thân, tiêu tán năng lượng thừa trước khi nó tích tụ thành dâm hỏa.',
    },
    repentance: {
      title: 'Sám Hối & Tái Lập Khi Lỡ Sa Ngã',
      subtitle: 'Thất bại là một thử thách trên con đường tu dưỡng. Đừng đắm chìm trong cảm giác tội lỗi, hãy tha thứ cho chính mình và dũng cảm đứng dậy làm lại!',
      quote: '"Trong Phật pháp, người có tội biết chí tâm sám hối và không tái phạm thì như ngọc bích rơi xuống bùn được rửa sạch, hào quang lại sáng ngời như xưa. Cảm giác tự ghét bỏ bản thân chỉ khiến tâm bạn yếu đuối và dễ sa ngã hơn. Hãy bình tâm, sám hối và lập lại thệ nguyện!"',
      ritualTitle: 'BÀI VĂN SÁM HỐI TÀ DÂM & BẢO TOÀN GIỚI THỂ',
      invocations: [
        'Nam Mô Đại Bi Quán Thế Âm Bồ Tát! 🙏 (3 lần)',
        'Nam Mô Địa Tạng Vương Bồ Tát! 🙏 (3 lần)',
        'Nam Mô A Di Đà Phật! 🙏 (3 lần)',
      ],
      ritualP1: '"Đệ tử chúng con xin chí thành cúi đầu trước Mười Phương Tam Bảo, Chư Phật, Chư Bồ Tát, Chư Vị Hộ Pháp Thiện Thần và Cửu Huyền Thất Tổ.',
      ritualP2: 'Vì vô minh và tập khí sâu nặng từ nhiều đời nhiều kiếp, hôm nay con đã lỡ buông lung tâm ý, không giữ trọn giới hạnh, làm tổn hại sinh lực và phước đức của bản thân.',
      ritualP3: 'Nay con xin chí tâm sám hối, phát lồ sám hối trước Tam Bảo. Cầu xin chư Phật từ bi gia hộ cho con có thêm định lực kiên cường, đoạn trừ vĩnh viễn tà niệm dâm dục, giữ gìn thân tâm trinh bạch thanh tịnh, bảo toàn chân khí để tu học và phụng sự nhân gian.',
      ritualClosing: 'Nam Mô Cầu Sám Hối Bồ Tát Ma Ha Tát! 🙏 (3 lần)"',
      recoveryHeading: 'Hành Động Khôi Phục Năng Lượng Ngay Sau Khi Sa Ngã:',
      recStep1: '1. Rửa mặt bằng nước mát, uống 1 cốc nước ấm thanh lọc cơ thể.',
      recStep2: '2. Đảnh lễ Phật 21 lạy hoặc 108 lạy sám hối để tiêu trừ nghiệp chướng.',
      recStep3: '3. Phát nguyện nghe hoặc trì Chú Lăng Nghiêm liên tục trong 7 ngày tới.',
      resetStreakCta: '🔄 ĐẶT LẠI CHUỖI & PHÁT NGUYỆN LÀM LẠI TỪ HÔM NAY',
    },
    modals: {
      pledgeTitle: '🙏 PHÁT NGUYỆN THANH TỊNH CÙNG ĐẠI CHÚNG',
      pledgeIntro: (count: string) => `Tham gia cùng ${count} bạn đồng tu đang cùng nhau gìn giữ giới hạnh và tiết chế dục vọng trên khắp mọi miền.`,
      pledgeVow: '"Trước Tam Bảo, Chư Vị Hộ Pháp và Cửu Huyền Thất Tổ, con xin phát nguyện tiết chế dục vọng, đoạn trừ thói quen thủ dâm và xem nội dung khiêu dâm, giữ gìn thân tâm thanh tịnh, bảo toàn nguyên khí để sáng suốt trí tuệ và báo hiếu cha mẹ."',
      pledgePrivacy: '🔒 Cam kết bảo mật: Hệ thống chỉ ghi nhận số lượng để trợ duyên cho nhau. Danh tính của bạn ẩn danh 100%.',
      pledgeCancel: 'Chưa vội',
      pledgeConfirm: 'Con Xin Phát Nguyện 🙏',
      relapseTitle: '🕊️ ĐẶT LẠI CHUỖI & ĐỨNG DẬY LÀM LẠI',
      relapseIntro: 'Đừng tự trách mình! Hãy đúc rút bài học để lần sau không lặp lại sai lầm.',
      relapseReasonLabel: 'Nguyên nhân kích hoạt cơn dục:',
      relapseReasons: [
        { label: '📱 Xem mạng xã hội / xem phim có hình ảnh gợi dục', value: 'Xem mạng xã hội / xem phim có hình ảnh gợi dục' },
        { label: '🛌 Nằm một mình trên giường thức khuya', value: 'Nằm một mình trên giường thức khuya' },
        { label: '😫 Áp lực, căng thẳng, stress công việc / học tập', value: 'Áp lực, căng thẳng, stress công việc / học tập' },
        { label: '😔 Cô đơn, buồn chán, rảnh rỗi không có việc làm', value: 'Cô đơn, buồn chán, rảnh rỗi không có việc làm' },
        { label: '🌶️ Ăn đồ cay nóng, bổ béo, dùng chất kích thích', value: 'Ăn đồ cay nóng, bổ béo, dùng chất kích thích' },
        { label: 'Lý do khác', value: 'Khác' },
      ],
      relapseNoteLabel: 'Bài học rút ra (tùy chọn):',
      relapseNotePlaceholder: 'Ví dụ: Tối nay phải để điện thoại ở xa giường...',
      relapseCancel: 'Hủy',
      relapseConfirm: 'Đặt lại & Bắt đầu lại ngay! 🙏',
      checkInTitle: 'XÁC NHẬN ĐIỂM DANH THANH TỊNH',
      checkInQuestion: 'Bạn có chắc chắn hôm nay đã giữ giới thanh tịnh không thủ dâm, tà dâm?',
      checkInWarning: '⚖️ "Hãy trung thực với chính mình vì người đang làm, quỷ thần đang xem!"',
      checkInConfirm: '✓ Tôi chắc chắn: Hôm nay hoàn toàn thanh tịnh',
      checkInCancel: 'Chưa chắc chắn / Để sau',
      adjustTitle: '🗓️ ĐIỀU CHỈNH NGÀY BẮT ĐẦU THANH TỊNH',
      adjustIntro: 'Dành cho đồng tu đã bắt đầu tiết dục / giữ giới từ trước khi dùng ứng dụng, giúp bạn tiếp nối chuỗi ngày thực tế một cách chính xác.',
      adjustDateLabel: 'Chọn ngày bạn đã bắt đầu giữ giới:',
      adjustPrivacy: '💡 Hệ thống sẽ tự động tính toán lại chuỗi ngày thanh tịnh và các cột mốc tương ứng từ ngày bạn chọn.',
      adjustCancel: 'Hủy',
      adjustConfirm: 'Lưu thay đổi 🙏',
    },
  },
  en: {
    storageError: 'Could not save on this device. Please try again; your previous progress is preserved.',
    conductLinkError: 'Your check-in is saved, but could not be linked to the precept record. You can try linking it again.',
    retryConductLink: 'Retry linking',
    header: {
      title: 'Sexual Restraint & Well-being',
      subtitle: 'Overcome masturbation addiction and practise sexual restraint',
      back: 'Back',
    },
    onboarding: {
      badge: '🛡️',
      heading: 'SEXUAL RESTRAINT & WELL-BEING PROGRAM',
      question: 'Would you like to join the Sexual Restraint & Well-being program to overcome compulsive habits and cultivate pure conduct?',
      subtext: 'This program helps you restore vitality, track consecutive days of purity, observe important Buddhist abstinence days, and access emergency tools to extinguish sensual cravings.',
      joinBtn: '✓ YES, I WANT TO JOIN NOW',
      backBtn: 'Later (Back)',
      privacy: '🔒 Completely private & anonymous. Your streak and progress are stored locally on your device.',
    },
    tabs: {
      overview: 'Overview',
      progress: 'My Progress',
      sos: 'SOS Urge Quencher',
      audio: '15-Min Audio',
      diet: 'Food and daily habits',
      repentance: 'Repent and begin again',
    },
    overview: {
      relapseWarningTitle: 'WARNING AFTER RELAPSE — RISE UP WITH COURAGE!',
      relapseWarningText: 'A stumble is a valuable lesson to forge unwavering resolve. Do not despair! Diligently subdue sensual thoughts, remain steadfast, and complete 2 consecutive days of successful check-ins to restore your spiritual momentum.',
      recoveryProgressLabel: 'Recovery progress:',
      recoveryStatus: (current: number) => `${current} / 2 consecutive days checked in`,
      abstinenceAlert: (title: string, harm: string) => `Today is ${title}... engaging in masturbation or sensual misconduct incurs ${harm}.`,
      communityPractitioners: 'Fellow practitioners committed',
      communityUrgesResisted: 'Cravings subdued by community',
      pledgeCta: '🙏 I Vow to Uphold Pure Conduct with the Community',
      pledgeStatus: 'You are upholding pure conduct together with the community (100% Anonymous)',
      privacyNote: '🔒 Absolute privacy: Only aggregate counts are displayed to inspire communal strength. Your identity is 100% anonymous.',
      streakKicker: 'CONSECUTIVE CHECK-IN STREAK',
      daysLabel: 'DAYS',
      hoursLabel: 'hrs',
      minutesLabel: 'mins',
      secondsLabel: 'secs',
      nextGoalLabel: 'Next milestone:',
      maxGoalReached: 'Supreme fruit attained! 🏆',
      checkInDone: '✓ You have checked in for today',
      checkInAction: '🙏 Check-in: I maintained purity today',
      emergencySosCta: '🚨 EMERGENCY SOS (EXTINGUISH LUST)',
      relapseCta: '🕊️ Relapsed? Reset & Repent',
      checkInRuleTitle: 'How the check-in streak is counted:',
      checkInRuleText: 'Each Vietnam calendar day counts once when you confirm your check-in; the hours, minutes and seconds do not add days automatically. Missing a day resets the streak to 0 and pauses the clock at 00:00:00. Your next check-in starts a new 1-day streak with the clock running again from 00:00:00. A missed check-in never records a relapse or deletes your history.',
      longestStreakLabel: 'Longest streak:',
      resistedCountLabel: 'Urges resisted:',
      startedFromLabel: '🗓️ Clean since:',
      adjustDateAction: '(Edit)',
      adjustDateTitle: 'Adjust start date if you began before using the application',
    },
    progress: {
      heading: 'Progress & 17 Transformation Milestones (Up to 20 Years)',
      subheading: 'Track every step of vitality recovery and mental stillness on your pure conduct journey.',
      currentStreak: 'Current streak:',
      currentMilestoneLabel: 'Current milestone:',
      nextTargetLabel: 'Next target:',
      daysRemaining: (days: number) => `${days} days left`,
      maxPerfection: '🏆 Supreme perfection attained!',
      pctToNext: (pct: number) => `${pct}% to next milestone`,
      badgeCurrent: '⭐ CURRENT',
      badgeUnlocked: '✓ ACHIEVED',
      badgeLocked: (days: number) => `🔒 ${days} days left`,
      daysUnit: 'days',
    },
    sos: {
      alarmTitle: 'EMERGENCY ALERT: EXTINGUISH SENSUAL FIRE IMMEDIATELY!',
      alarmDesc: (mins: string, secs: string) => `Sounding awakening siren (${mins}:${secs}) & singing bowl. Maintain mindfulness, keep hands away from the body!`,
      muteSiren: '🔇 Mute Siren',
      sirenStoppedNote: 'Siren muted. If cravings still urge, click to reactivate awakening siren:',
      restartSiren: '🚨 Reactivate Awakening Siren (2 Mins)',
      bannerTitle: 'STOP RIGHT NOW! YOU ARE NOT ALONE!',
      bannerSubtitle: 'Lust is merely a temporary 10-15 minute biochemical illusion. Implement the 3 methods below immediately to extinguish it!',
      strikeBowlBtn: '🔔 Strike Tibetan Singing Bowl (3x)',
      step1Num: '1',
      step1Title: 'MIND AWAKENING (Shatter the Illusion of Being Alone)',
      step1Desc: 'Acknowledge spiritual reality to awaken conscience and moral shame (Hiri-Ottappa)',
      witnessBuddhaTitle: 'BUDDHAS & BODHISATTVAS OF THE TEN DIRECTIONS',
      witnessBuddhaDesc: 'The wisdom eye of all Buddhas clearly perceives your every fleeting thought, even in the darkest secluded room. They look upon you with infinite compassion as ignorance burns away your hard-earned merit.',
      witnessDevaTitle: 'DHARMA PROTECTORS & VIRTUOUS DEITIES',
      witnessDevaDesc: 'They stand watch guarding virtuous souls. When lustful thoughts take over, foul psychic stench causes heavenly guardians to turn away in sorrow, removing their protective aura.',
      witnessAncestorsTitle: 'ANCESTORS & LINEAGE GUARDIANS',
      witnessAncestorsDesc: 'Spirits of ancestors and past parents look upon you with sorrow and shame before unseen realms as their descendant degenerates and dissipates ancestral blessings.',
      witnessDemonsTitle: 'ENERGY-DRAINING SPIRITS & DEMONS',
      witnessDemonsDesc: 'Lust-feeding spirits hover around, waiting for you to release vital essence so they can feast on your vital energy, leaving your body depleted, mind disordered, and luck depleted.',
      consequencesBadge: '⚖️ INFALLIBLE KARMIC RETRIBUTION',
      consequencesTitle: 'WHAT HAPPENS IF YOU COMMIT MASTURBATION, SEXUAL MISCONDUCT, OR ADULTERY?',
      consequencesIntro: 'Ancient masters taught: "Of all unwholesome deeds, lust is the foremost." Pleasure lasts mere seconds, but the karmic price is catastrophic:',
      card1Title: 'IF YOU ENGAGE IN MASTURBATION (Pornography & Self-Gratification):',
      card1Tag: 'Destroys Physical Health & Drains Intellect',
      card1Points: [
        'Devastates internal organs: One drop of essence equals ten drops of blood. Chronic ejaculation depletes bone marrow, shrinks brain tissue, and exhausts kidney energy, causing lower back pain, tinnitus, early hair loss, and foul bodily odors.',
        'Loss of dignity & aura: The face turns dull and sallow, eyes lose focus and luster, and demeanour appears timid and untrustworthy. People naturally distance themselves and disregard your word.',
        'Destroys career & mental acuity: Severe memory loss and chronic brain fog impair analytical and creative thought. Exams, interviews, and business endeavors repeatedly fail; wealth slips away through unexpected leaks.',
        'Severe mental distress: Living in continuous guilt, fear, and self-loathing; highly prone to anxiety disorders, depression, paranoia, and complete paralysis of will.'
      ],
      card2Title: 'IF YOU COMMIT SEXUAL MISCONDUCT (Promiscuity, Soliciting, Pre-marital Indulgence):',
      card2Tag: 'Depletes Merits & Destroys Wholesome Affinities',
      card2Points: [
        'Ruin of reputation & disease: Brings public humiliation, severe risk of infectious venereal diseases, lifelong disgrace to self and parents.',
        'Turbulent relationships & ruined marriage: Cultivating promiscuity inevitably attracts deceptive, unfaithful partners. Future marriages suffer chronic distrust; children are sickly or rebellious.',
        'Deities depart, spirits swarm: Celestial guardians withdraw in sorrow; energy-sucking spirits attach themselves, causing sudden accidents and persistent misfortunes.',
        'Rapid depletion of merits: Virtues accumulated over lifetimes burn up swiftly. Those destined for high honor or prosperity fall into hardship and poverty.'
      ],
      card3Title: 'IF YOU COMMIT ADULTERY (Betraying Spouse, Engaging with Married Partners):',
      card3Tag: 'Grave Sin of Destroying Families & Hell Realm Karma',
      card3Points: [
        'Destruction of moral order: Stabs a dagger into a spouse’s sacred trust; brings deep shame to both families, leaving innocent children traumatized and adrift.',
        'Public ruin & financial ruin: Often leads to lawsuits, public exposure, lost careers, social ostracization, bankrupt estates, or even bloody tragedies.',
        'Cursing future offspring: Adultery burns away ancestral virtue, causing future children to struggle in life or repeat the painful cycle of betrayal.',
        'Dire retribution in lower realms: Buddhist sutras warn: Adulterers upon death descend directly into the Copper Pillar and Iron Bed hells, enduring scorching agonies across countless aeons.'
      ],
      awakenCallout: '🔥 AWAKEN BEFORE IT IS TOO LATE: Every moment you subdue lust today, you accumulate immeasurable virtue, preserving vitality, longevity, and blessings for yourself and future generations!',
      step2Num: '2',
      step2Title: 'PHYSICAL QUENCHING (Immediate Bodily Intervention)',
      step2Desc: 'Redirect blood circulation and cool down the nervous system instantly',
      phys1Title: '1. Apply ice to forehead & face',
      phys1Desc: 'Apply ice cubes (or iced towel) directly to forehead, temples, and back of the neck. The cold shock constricts cranial vessels, swiftly cooling physiological arousal.',
      phys2Title: '2. Take a cool shower or splash water',
      phys2Desc: 'Step into the shower, pour cold water over your head or splash cool water. The therapeutic temperature drop shifts your nervous system into a calm state.',
      phys3Title: '3. Leave bed & enclosed room',
      phys3Desc: 'Open windows wide, turn on all lights, step into the living room or hallway. Under no circumstances remain alone in bed with a phone!',
      squatCounterTitle: '100 SQUAT COUNTER TO EXHAUST CRAVINGS',
      squatCounterDesc: 'Forces blood circulation into large leg muscles, dissipating pelvic congestion and eliminating lust.',
      squatAdd5: '+5 squats',
      squatAdd1: '+1 squat',
      squatReset: 'Reset',
      step3Num: '3',
      step3Title: 'SACRED RECITATION (Chanting Shurangama & Guanyin)',
      step3Desc: 'Employ the transcendent resonance of Buddhist mantras to expel lustful thoughts',
      listenAudioCta: '🎧 PUT ON HEADPHONES & LISTEN TO SHURANGAMA MANTRA FOR 15 MINS NOW',
      heartMantraTitle: 'SHURANGAMA HEART MANTRA (RECITE 21 TIMES CONTINUOUSLY):',
      heartMantraContent: '"Tadyathā: Oṃ anale viśade vīra vajradhare bandha bandhani vajrapāṇi phaṭ hūṃ trūṃ phaṭ svāhā."',
      resistedSuccessBtn: '✓ I HAVE SAFELY OVERCOME THE CRAVING! 🙏',
      resistedSuccessDesc: 'Click confirm to record a glorious victory and reinforce communal strength.',
      resistedSuccessAlert: 'Sadhu! You have successfully triumphed over a surge of sensual craving. Your samadhi and merits have grown tremendously! 🙏',
      surrenderBtn: '💔 I RELAPSED / FAILED TO OVERCOME CRAVING (MASTURBATION)',
      completionAlert: 'Completed 15 minutes of listening to Shurangama Mantra! Your body and mind are now peaceful and purified. 🙏',
    },
    audio: {
      screenTitle: 'Sexual Restraint & Well-being',
      tabOverview: 'Overview',
      tabProgress: 'Progress',
      tabSos: 'Overcome an urge',
      tabAudio: 'Listen to mantras',
      nameLine1: 'Homage to Manjushri',
      nameLine2: 'Bodhisattva of Great Wisdom',
      remainingLabel: 'Remaining',
      sessionLabel: (mins: number) => `${mins}-minute session`,
      seekAria: 'Playback position',
      loopLabel: 'Repeat',
      kicker: 'SUPREME DHARMA TREASURE TO SUBDUE CRAVING',
      title: 'Shurangama Dharani',
      desc: 'Please wear headphones, focus your mind on the chanting, and listen for at least 15 minutes.',
      timerRemaining: (time: string) => `Remaining time in session: ${time}`,
      timerRecommended: (mins: number) => `Recommended timer: ${mins} mins to extinguish lust`,
      loopOn: '🔁 Loop: ON',
      loopOff: '🔁 Loop: OFF',
      loopActiveTitle: 'Looping enabled',
      loopInactiveTitle: 'Looping disabled',
      pauseBtn: 'Pause',
      playBtn: 'Play Shurangama mantra',
      volumeAria: 'Volume',
      timerSelectorLabel: 'Session timer:',
      timerUnlimited: 'Unlimited',
      timerMins: (m: number) => `${m} mins`,
      storyTitle: 'Origin of Saving Ananda from Matanga & The Wonder of Shurangama Mantra',
      storyP1: 'In the Shurangama Assembly, the Venerable Ananda was begging for alms alone when the Matanga maiden ensnared him with a Brahma enchantment, nearly destroying his pure precepts in a private room. From the crown of the Buddha’s head radiated a hundred-jeweled light, and Manjushri Bodhisattva was dispatched with the Shurangama Mantra to shatter the dark spell, extinguishing lust and delivering Ananda.',
      storyP2: 'Thus, the Shurangama Mantra is the foremost mantra in Buddhism for conquering demons and subduing lust. Anyone who persistently listens to or recites it daily will, within 21 to 100 days, clearly experience lust subsiding, leaving the mind as luminous as pure jade.',
      reciteScriptureBtn: '📿 RECITE SCRIPTURE (Full Shurangama Liturgy) →',
    },
    diet: {
      title: 'Pure Diet & Celibate Lifestyle',
      subtitle: 'Vitality originates from food. Pure and wholesome nourishment is the firmest foundation to extinguish lust from its biological root.',
      badgeLimit: 'STRICTLY LIMIT',
      meatTitle: '🥩 Limit Hot-Natured Animal Meats',
      meatDesc: 'Red meats (beef, lamb, game) possess intensely heating properties. Heavy meat consumption triggers hormone surges and restless energy, making sensual impulses far harder to control.',
      badgeRecommend: 'STRONGLY RECOMMENDED',
      veganTitle: '🌿 Pure Vegetarian Diet is Best',
      veganDesc: 'Plant-based nourishment (vegetables, tofu, whole grains, nuts, seeds) has cooling, detoxifying properties. It fosters a peaceful mind, naturally cooling down sensual fires.',
      badgeForbidden: 'STRICTLY FORBIDDEN',
      pungentTitle: '🧄 Avoid Five Pungent Roots (Garlic, Onions, Leeks, Scallions, Chives)',
      pungentDesc: 'The Buddha clearly taught in the Shurangama Sutra: These five pungent roots "cooked produce lust, eaten raw incite anger". They emit coarse odors that arouse unwholesome desires, repelling benevolent deities and attracting hungry ghosts.',
      lifestyleTitle: '🌙 3 Golden Rules for Daily Living',
      rule1Title: '1. Never bring your phone into bed in the dark:',
      rule1Desc: '95% of relapses occur while lying alone browsing a phone late at night. Charge your phone across the room before sleeping.',
      rule2Title: '2. Go to sleep before 10:30 PM:',
      rule2Desc: 'Between 11:00 PM and 1:00 AM, kidney essence undergoes crucial renewal and temptations peak. Sleeping early restores vital energy and nourishes kidneys.',
      rule3Title: '3. Rise early to exercise and breathe fresh air:',
      rule3Desc: 'Early morning squats, jogging, or push-ups circulate vital energy throughout the body, safely channeling excess energy before it combusts into lust.',
    },
    repentance: {
      title: 'Repentance & Reset After a Relapse',
      subtitle: 'A stumble is a trial along the path of self-cultivation. Do not drown in guilt; forgive yourself, and courageously rise again!',
      quote: '"In the Buddha Dharma, one who errs but sincerely repents and vows not to repeat it is like a jewel fallen in mud that has been washed clean—its radiance shines as bright as before. Self-loathing only weakens the spirit. Be calm, repent, and renew your vow!"',
      ritualTitle: 'REPENTANCE LITURGY FOR SENSUAL ATTACHMENT & PRECEPT PRESERVATION',
      invocations: [
        'Namo Great Compassion Avalokiteshvara Bodhisattva! 🙏 (3 times)',
        'Namo Ksitigarbha Bodhisattva! 🙏 (3 times)',
        'Namo Amitabha Buddha! 🙏 (3 times)',
      ],
      ritualP1: '"We, disciples, bow sincerely before the Triple Gem of the Ten Directions, all Buddhas, Bodhisattvas, Dharma Protectors, and Ancestors.',
      ritualP2: 'Owing to deep-seated ignorance and past karmic habit energies, today I unmindfully indulged my thoughts, failing to uphold pure conduct, harming my vitality and merits.',
      ritualP3: 'Now, I sincerely repent and lay bare all shortcomings before the Triple Gem. May all Buddhas bestow compassionate grace, granting me steadfast samadhi to permanently sever lustful desires, uphold pure bodily and mental discipline, and preserve vital energy to study the Dharma and serve all beings.',
      ritualClosing: 'Namo Repentance Bodhisattva Mahasattva! 🙏 (3 times)"',
      recoveryHeading: 'Immediate Actions to Recover Vitality After Relapsing:',
      recStep1: '1. Wash face with cool water, drink a glass of warm water to rehydrate.',
      recStep2: '2. Offer 21 or 108 prostrations to the Buddha in repentance to purify negative karma.',
      recStep3: '3. Vow to listen to or recite the Shurangama Mantra daily for the next 7 days.',
      resetStreakCta: '🔄 RESET STREAK & RENEW PLEDGE FROM TODAY',
    },
    modals: {
      pledgeTitle: '🙏 PURE CONDUCT VOW WITH THE COMMUNITY',
      pledgeIntro: (count: string) => `Join ${count} fellow practitioners upholding pure conduct and celibacy across the world.`,
      pledgeVow: '"Before the Triple Gem, Dharma Protectors, and Ancestors, I vow to restrain sensual cravings, abandon masturbation and pornography, maintain body and mind in pure conduct, and preserve vital energy to cultivate wisdom and honor my parents."',
      pledgePrivacy: '🔒 Absolute privacy: The system only records aggregate counts. Your identity remains 100% anonymous.',
      pledgeCancel: 'Not now',
      pledgeConfirm: 'I Take This Solemn Vow 🙏',
      relapseTitle: '🕊️ RESET STREAK & RISE UP AGAIN',
      relapseIntro: 'Do not condemn yourself! Reflect on the trigger so you won’t repeat the mistake next time.',
      relapseReasonLabel: 'Trigger that prompted craving:',
      relapseReasons: [
        { label: '📱 Social media / suggestive videos or movies', value: 'Xem mạng xã hội / xem phim có hình ảnh gợi dục' },
        { label: '🛌 Lying awake in bed alone late at night', value: 'Nằm một mình trên giường thức khuya' },
        { label: '😫 Work / school pressure, stress or anxiety', value: 'Áp lực, căng thẳng, stress công việc / học tập' },
        { label: '😔 Loneliness, boredom, idle time', value: 'Cô đơn, buồn chán, rảnh rỗi không có việc làm' },
        { label: '🌶️ Spicy foods, stimulants, heavy meats', value: 'Ăn đồ cay nóng, bổ béo, dùng chất kích thích' },
        { label: 'Other reason', value: 'Khác' },
      ],
      relapseNoteLabel: 'Lesson learned (optional):',
      relapseNotePlaceholder: 'e.g. Leave phone far from bed tonight...',
      relapseCancel: 'Cancel',
      relapseConfirm: 'Reset & Restart Right Now! 🙏',
      checkInTitle: 'CONFIRM DAILY PURITY CHECK-IN',
      checkInQuestion: 'Are you certain you maintained pure conduct today free from masturbation or sexual misconduct?',
      checkInWarning: '⚖️ "Be truthful with yourself: human eyes may be shut, but the spiritual realm sees all!"',
      checkInConfirm: '✓ I am certain: Today was completely pure',
      checkInCancel: 'Not certain / Check later',
      adjustTitle: '🗓️ ADJUST PURITY START DATE',
      adjustIntro: 'For practitioners who began celibacy before using the app, allowing you to accurately continue your actual streak.',
      adjustDateLabel: 'Select the date you began upholding pure conduct:',
      adjustPrivacy: '💡 The system will automatically recalculate your streak and corresponding milestones from that date.',
      adjustCancel: 'Cancel',
      adjustConfirm: 'Save Changes 🙏',
    },
  },
};
