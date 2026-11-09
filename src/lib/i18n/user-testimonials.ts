export const userTestimonialsCopy = {
  vi: {
    title: 'Chia sẻ từ người dùng',
    subtitle: 'Những trải nghiệm trên hành trình tìm hiểu và thực hành Phật pháp.',
  },
  en: {
    title: 'User stories',
    subtitle: 'Personal experiences of learning and practising the Buddha Dharma.',
  },
};

export interface UserTestimonial {
  id: string;
  name: string;
  paragraphs: string[];
  signature?: string;
}

export const userTestimonials: UserTestimonial[] = [
  {
    id: 'mai-huong',
    name: 'Mai Hương',
    paragraphs: [
      'Nhờ duyên thiện lành, em mới biết đến bộ Kinh Địa Tạng và cư sĩ Quang Từ. Hiện em vẫn đang trên con đường tìm hiểu, từng bước học hỏi và tu tập. Tuy mới trải nghiệm ứng dụng, em đã cảm thấy app rất hay và ý nghĩa. Em xin cảm ơn công đức của các anh chị đã chia sẻ, truyền trao để ngày càng nhiều người biết đến, tìm hiểu và nương tựa vào Phật pháp.',
      'Bản thân em cũng từng trải qua những khó khăn về tinh thần, có lúc tưởng như muốn buông xuôi. Nhưng nhờ duyên lành được đọc kinh và niệm danh hiệu Ngài Địa Tạng Bồ Tát, dù công đức tu tập của em chưa được bao nhiêu, em cũng đã cảm nhận được sự an ổn hơn trong lòng.',
      'Trên app còn rất nhiều mục em chưa tìm hiểu hết. Với em, đó là cả một kho tàng quý mà anh Quang Từ đã dành công sức tổng hợp và chia sẻ đến mọi người.',
      'Em kính chúc mọi người tu tập ngày càng tinh tấn. Em mong sẽ có thêm nhiều người biết đến và sử dụng app, để ai cũng có thể bắt đầu gieo trồng thiện căn và sớm gặt hái quả lành.',
    ],
  },
  {
    id: 'khanh-vy-kinh-online',
    name: 'Khánh Vy',
    paragraphs: [
      'Em thấy có app rất tiện vì có thể theo dõi công phu tu tập của mình, chẳng hạn như việc chép Hồng Danh của chư Phật, Bồ Tát. Những bài kinh và lời dạy được tổng hợp trong app cũng giúp em hiểu thêm về nhân quả, về việc chịu tội nơi địa ngục, và nhận ra nhiều quan niệm trước đây của mình chưa đúng.',
      'Có kinh online, em chỉ cần mở app ra để đọc, không phải mang theo kinh bên người mỗi khi đi đâu. Điều này cũng giúp em giảm bớt và tránh những sơ suất như đặt kinh ở nơi chưa được tôn nghiêm.',
    ],
  },
  {
    id: 'khanh-vy-cong-dong',
    name: 'Khánh Vy',
    paragraphs: [
      'Em đã biết đến Phật pháp từ lâu, nhưng trước đây chưa thật sự chuyên chú tu tập và thường dễ mất động lực. Từ khi tham gia cộng đồng, cùng mọi người hướng đến các mục tiêu tu tập, em có thể ghi lại và xem mình đã niệm được bao nhiêu danh hiệu Phật, tụng bao nhiêu biến kinh, chép được bao nhiêu Hồng Danh. Nhờ vậy, em có thêm động lực để đặt mục tiêu và cố gắng hoàn thành số biến lớn mà mình đã đề ra.',
      'Sau một thời gian, cứ rảnh lúc nào hoặc tìm được thời điểm thích hợp là em tu tập. Trước đây em cũng thường lo lắng, buồn phiền nhiều, nhưng giờ đã đỡ hơn và ngày càng cảm nhận được lòng từ bi vô hạn của Ngài Địa Tạng.',
      'Em nhận thấy mình chưa hiểu biết được nhiều, nhưng niệm danh hiệu Ngài Địa Tạng hay Ngài A Di Đà thì em có thể làm được. Em cứ tụng Kinh Địa Tạng rồi ghi lại công phu của mình. Mỗi lần nhìn lại quá trình đã tu tập, em thấy mình như đang vượt qua chính mình và ngày càng hoàn thiện bản thân hơn.',
      'Em rất mong app ngày càng phát triển và lan tỏa điều thiện đến muôn nơi.',
    ],
  },
  {
    id: 'thu-huong',
    name: 'Thu Hương',
    paragraphs: [
      'Sau một thời gian mò mẫm tìm hiểu, khi được sử dụng app, mình thấy đây là nơi tập hợp gần như đầy đủ những gì cần cho việc tu tập. Các hướng dẫn rất chi tiết, kiến thức sâu rộng mà vẫn dễ hiểu; các mục được sắp xếp rõ ràng, có trình tự nên rất dễ sử dụng.',
      'App có nhiều tính năng và công năng hữu ích, phù hợp với nhiều người. Dù bận rộn hay chưa có điều kiện, mọi người vẫn có thể nương theo các hướng dẫn để tu tập mỗi ngày.',
      'Mỗi lần đọc được một điều mới mà trước giờ mình chưa biết, trong lòng mình lại dâng lên niềm xúc động và biết ơn người đã dành tâm huyết, công sức và tấm lòng để tạo ra app; biên soạn, tập hợp và giảng giải cặn kẽ, giúp nhiều người tiếp cận Phật pháp một cách gần gũi và đúng đắn, từ đó tin sâu nhân quả và làm theo lời Phật dạy.',
      'Mình xin chân thành tri ân cư sĩ Quang Từ cùng những người đã góp sức cho ứng dụng. Mong rằng ngày càng có nhiều người được biết đến app.',
      'Nam Mô A Di Đà Phật.',
    ],
  },
  {
    id: 'thuy-giang-dmp',
    name: 'Thuy Giang Dmp',
    paragraphs: [
      'Em thấy app có giao diện đẹp, dễ sử dụng, các hướng dẫn rất chi tiết và chuyên nghiệp. Từ người mới bắt đầu cho đến người đã tu tập lâu, mọi người đều có thể tìm được đầy đủ hướng dẫn và tài liệu tu tập.',
      'Các tài liệu có chất lượng, được trình bày chi tiết và chuẩn xác theo cảm nhận của em. Hình ảnh Phật, Bồ Tát đều đẹp và trang nghiêm.',
      'Với nhu cầu của cá nhân em, app đã có đầy đủ những mục cần thiết cho việc tu tập.',
    ],
  },
  {
    id: 'le-ha',
    name: 'Le Ha',
    paragraphs: [
      'Khi dùng app, em có thể nghe pháp thoại rất mượt, không bị quảng cáo chen ngang như khi nghe ở bên ngoài, nhờ đó em tập trung hơn.',
      'Với người đi làm bận rộn, có app này thì việc tu tập vào bất cứ lúc nào phù hợp cũng thuận tiện hơn.',
      'App còn có những câu chuyện nhân quả có thật ngay trong đời sống hiện nay ở Việt Nam. Những câu chuyện ấy giúp em càng thêm tin sâu nhân quả.',
      'Theo cảm nhận của em, các bài pháp đều được chọn lựa kỹ lưỡng và rất hay. Dù là người mới biết đến Phật pháp hay đã tìm hiểu từ lâu, mọi người đều có thể sử dụng app và tìm được nội dung hữu ích.',
      'Em mong app dần có thêm nhiều ngôn ngữ để các bạn quốc tế cũng có thể tiếp cận và nhận được lợi ích.',
      'Em xin chân thành cảm ơn đội ngũ đã làm ra một ứng dụng rất có ích.',
    ],
  },
  {
    id: 'thu-trang',
    name: 'Thu Trang',
    paragraphs: [
      'Là một người mới biết đến Phật pháp và đang từng bước tìm hiểu con đường tu tập, mình cảm thấy rất may mắn khi biết đến ứng dụng tu tập do cư sĩ Quang Từ tâm huyết xây dựng và chia sẻ đến mọi người.',
      'Khi sử dụng ứng dụng, mình cảm nhận được rất nhiều tâm huyết, sự tận tụy và tấm lòng của người xây dựng. Từ kinh điển, những bài giảng, tài liệu học Phật cho đến các nội dung hướng dẫn thực hành tu tập, mọi thứ đều được tổng hợp và chia sẻ rất phong phú, hữu ích.',
      'Đặc biệt, với một người mới như mình, ứng dụng giống như một người bạn đồng hành, giúp mình có thêm kiến thức, định hướng và từng bước hiểu đúng hơn về Phật pháp.',
      'Mình xin gửi lời biết ơn chân thành đến cư sĩ Quang Từ cùng tất cả những người đã góp công sức xây dựng và duy trì ứng dụng này.',
      'Nguyện cầu cho mọi công sức và thiện tâm của quý vị luôn được vun bồi, lan tỏa; ứng dụng ngày càng phát triển, mang lại nhiều lợi ích cho cộng đồng, giúp thêm nhiều người có duyên biết đến Phật pháp, sống an lành, hiểu biết và chuyển hóa bản thân theo hướng tốt đẹp hơn.',
      'Xin thành kính tri ân và biết ơn!',
    ],
  },
  {
    id: 'duc-tinh-hieu',
    name: 'Đức Tịnh Hiếu',
    paragraphs: [
      'App có nhiều tính năng phù hợp với những người mới bắt đầu tu tập, kèm hình ảnh hướng dẫn đầy đủ từng bước. App cũng có nhiều câu chuyện hay và ý nghĩa, giúp mọi người thêm tin sâu nhân quả, biết chấp nhận, buông bỏ và quay về với chính mình.',
      'Với mình, con đường thoát khỏi đau khổ nhanh nhất là con đường tu tập, chuyển hóa bản thân.',
      'Trong app còn có chế độ nhắc nhở tu tập và ghi nhận công phu, giúp người sử dụng tinh tấn hơn trên con đường tu tập, đồng thời biết đến nhiều kinh sách hơn.',
      'Xin niệm ân và tán thán công đức.',
    ],
  },
];
