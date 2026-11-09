import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const books = [
  {
    vol: 1,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q1.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q01.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q01.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q01.webp',
    id: 'tt_klngl_q01',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 1',
    tom_tat: 'Quyển 1 giải thích nguồn gốc và đại ý Kinh Lăng Nghiêm, duyên khởi nạn A-Nan và nàng Ma-Đăng-Già, Phật phóng quang tuyên thuyết Thần Chú Lăng Nghiêm và bảy lần gạn hỏi tâm để phá trừ vọng chấp, chỉ ra chân tâm thanh tịnh.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 1</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Kinh Lăng Nghiêm được ví như chiếc kính chiếu yêu của Phật giáo, là bộ kinh phá tan mọi tà thuyết và chỉ thẳng tâm tính vi diệu. Nếu kinh Lăng Nghiêm còn lưu truyền ở thế gian thì chánh pháp còn tồn tại; nếu kinh Lăng Nghiêm biến mất thì mạt pháp hiện tiền.</p><h3>Nội dung chính Quyển 1:</h3><ul><li><strong>Khai kinh & Giải thích đề kinh:</strong> Phân tích tổng quát diệu nghĩa của đề kinh Đại Phật Đảnh Thủ Lăng Nghiêm, bảy loại lập đề kinh trong Phật giáo, nhân duyên phát khởi và tông chỉ tu tập.</li><li><strong>Duyên khởi nạn A-Nan:</strong> Ngài A-Nan mắc nạn chú thuật Ta-tỳ-ca-la của nàng Ma-đăng-già trên đường khất thực; Đức Phật Thích Ca Mầu Ni từ đỉnh đầu phóng hào quang báu nghìn cánh hoa sen, tuyên thuyết Thần Chú Thủ Lăng Nghiêm sai Bồ Tát Văn Thù mang chú đi cứu nạn.</li><li><strong>Bảy chỗ gạn hỏi tâm (Thất xứ trưng tâm):</strong> Đức Phật tuần tự gạn hỏi và bác bỏ quan niệm chấp tâm ở trong thân, ở ngoài thân, núp sau con mắt, ở chỗ tối tăm, hòa hợp với các vật, ở chặng giữa, và không dính mắc ở đâu cả; từ đó phá sạch thói quen nhận giặc làm con, lầm nhận thức phân biệt hư vọng làm chân tâm.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Thất Xứ Trưng Tâm, Thần Chú Lăng Nghiêm, Giảng Giải Kinh Điển, Phật Giáo Đại Thừa',
    noi_bat: 1
  },
  {
    vol: 2,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q2.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q02.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q02.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q02.webp',
    id: 'tt_klngl_q02',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 2',
    tom_tat: 'Quyển 2 xiển dương Mười phen chỉ thị cái Thấy (Thập phiên hiển kiến) của Đức Phật, phân biệt giữa tâm sinh diệt hư vọng và bản tính thấy không sinh không diệt, không lay động, không biến đổi, vượt thoát trần cảnh.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 2</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Trong quyển này, Đức Phật chỉ dạy cho ngài A-Nan cùng vua Ba-tư-nặc và đại chúng phát minh tính sinh diệt cùng không sinh diệt nơi thân tâm, dẫn dắt hành giả nhận diện bản tính thấy thường hằng, bất biến giữa vạn pháp đổi thay.</p><h3>Nội dung chính Quyển 2:</h3><ul><li><strong>Khai thị cho vua Ba-tư-nặc:</strong> Chỉ ra thân xác tuy già nua biến đổi từng năm, từng tháng, từng sát-na, nhưng tính thấy từ lúc ba tuổi nhìn sông Hằng đến khi sáu mươi hai tuổi vẫn nguyên vẹn không suy già.</li><li><strong>Mười phen hiển thị tính Thấy (Thập phiên hiển kiến):</strong> Đức Phật chỉ bày tường tận tính thấy là tâm chứ không phải con mắt, tính thấy không lay động theo khách trần, tính thấy không sinh diệt, tính thấy không thể hoàn trả về trần cảnh, tính thấy không bị ngăn cách, tính thấy không thuộc về vật tượng...</li><li><strong>Phân biệt nhị chủng căn bản:</strong> Căn bản sinh tử luân hồi là nhận lầm vọng tưởng phan duyên; căn bản Bồ-đề Niết-bàn là bản thể Bồ-đề thanh tịnh xưa nay chưa từng sinh diệt.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Thập Phiên Hiển Kiến, Tánh Thấy Bất Diệt, Bản Tâm Bồ Đề, Giảng Kinh',
    noi_bat: 0
  },
  {
    vol: 3,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q3.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q03.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q03.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q03.webp',
    id: 'tt_klngl_q03',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 3',
    tom_tat: 'Quyển 3 phân tích sâu sắc bản chất của Năm Ấm, Sáu Nhập, Mười Hai Xứ, Mười Tám Giới và Bảy Đại chủng, chỉ rõ tất cả đều là biểu hiện huyễn hóa, vốn là tính chân như vi diệu từ Như Lai Tạng sinh khởi.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 3</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Đức Phật tiếp tục phá trừ nghi chấp của ngài A-Nan về thuyết Nhân duyên và Tự nhiên của ngoại đạo, chỉ rõ vạn pháp trong vũ trụ từ sắc tâm đến vật chất đều bắt nguồn từ tự tính Như Lai Tạng mầu nhiệm tròn đầy.</p><h3>Nội dung chính Quyển 3:</h3><ul><li><strong>Năm Ấm (Sắc, Thọ, Tưởng, Hành, Thức):</strong> Bản chất năm ấm vốn không tự tính, sinh diệt do hư vọng, bản thể thanh tịnh bản nhiên chu biến pháp giới.</li><li><strong>Sáu Nhập, Mười Hai Xứ, Mười Tám Giới:</strong> Mắt, tai, mũi, lưỡi, thân, ý cùng sắc, thanh, hương, vị, xúc, pháp và sáu thức; phân tích nguồn gốc hòa hợp hư vọng, chỉ ra chân nguyên quy về Như Lai Tạng.</li><li><strong>Bảy Đại chủng dung thông:</strong> Địa đại, Hỏa đại, Thủy đại, Phong đại, Không đại, Kiến đại, Thức đại; tính chân không là chân sắc, tính chân sắc là chân không, tùy tâm chúng sinh ứng hiện dung lượng hiểu biết mà hiện khởi.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Ngũ Uẩn, Thập Bát Giới, Thất Đại, Như Lai Tạng, Phật Học',
    noi_bat: 0
  },
  {
    vol: 4,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q4.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q04.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q04.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q04.webp',
    id: 'tt_klngl_q04',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 4',
    tom_tat: 'Quyển 4 giải thích nguồn gốc sinh khởi ba thứ tương tục (Thế giới, Chúng sinh, Nghiệp quả), sự dung thông các đại chủng, cùng Hai Nghĩa Quyết Định và pháp mở gút sáu căn để đạt giác ngộ vô thượng.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 4</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Trước câu hỏi sâu sắc của Bồ Tát Phú-lâu-na: "Nếu bản giác thanh tịnh xưa nay không đổi, tại sao núi sông đất đai và các tướng hữu vi lại bỗng nhiên sinh khởi?", Đức Phật từ bi phân tích cội nguồn tương tục của vũ trụ và nhân sinh.</p><h3>Nội dung chính Quyển 4:</h3><ul><li><strong>Ba thứ tương tục:</strong> Nguyên do sinh khởi Thế giới tương tục, Chúng sinh tương tục và Nghiệp quả tương tục do tính giác minh sinh vọng tưởng mà thành.</li><li><strong>Sự dung thông các đại chủng:</strong> Giải đáp khúc mắc vì sao thủy hỏa tương khắc mà cùng tồn tại dung thông khắp hư không pháp giới.</li><li><strong>Hai nghĩa quyết định căn bản để tu hành:</strong> Nghĩa thứ nhất là dùng tâm không sinh diệt làm nhân địa tu hành; nghĩa thứ hai là thẩm định cội gốc phiền não do sáu căn trói buộc để gỡ mở.</li><li><strong>Mở gút các căn:</strong> Nhận chân bản chất tiếng chuông vang lên rồi dứt nhưng tính nghe không bao giờ mất đi; nghe không phụ thuộc vào tiếng động.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Tam Chủng Tương Tục, Hai Nghĩa Quyết Định, Mở Gút Căn Trần, Tu Chứng',
    noi_bat: 0
  },
  {
    vol: 5,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q5.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q05.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q05.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q05.webp',
    id: 'tt_klngl_q05',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 5',
    tom_tat: 'Quyển 5 trình bày thí dụ mở sáu nút khăn hoa và 25 vị Đại Bồ Tát, A-la-hán lần lượt đối trước Đức Phật trình bày pháp môn viên thông chứng đắc giải thoát qua Sáu Trần, Năm Căn, Sáu Thức và Bảy Đại.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 5</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Đức Phật dùng chiếc khăn hoa báu cột thành sáu gút để khai thị đạo lý: do một tâm mê mờ mà kết thành sáu căn, muốn mở gút phải mở theo thứ tự từ trong ra ngoài; đồng thời thỉnh mời các bậc Thánh hiền trình bày con đường ngộ nhập chân tâm.</p><h3>Nội dung chính Quyển 5:</h3><ul><li><strong>Thí dụ sáu nút thắt:</strong> Chỉ rõ sáu căn đều từ một bản thể mà phát sinh gút mắc; mở một căn thông suốt thì năm căn kia tự nhiên giải thoát.</li><li><strong>Hai mươi lăm pháp môn viên thông:</strong> Các bậc đại đệ tử thuật lại nhân duyên chứng đạo vô lậu:
  <ul>
    <li>Viên thông Sáu Trần: Kiều-trần-như (thanh trần), Hương Nghiêm (hương trần)...</li>
    <li>Viên thông Năm Căn & Sáu Thức: Kiếp-tân-na, Xá-lợi-phất, Mục-kiền-liên, Tu-bồ-đề...</li>
    <li>Viên thông Bảy Đại: Bồ Tát Ô-sô-sa-ma (hỏa đại chuyển tâm dâm thành lửa trí tuệ), Nguyệt Quang Bồ Tát (thủy đại quán), Đại Thế Chí Bồ Tát (niệm Phật viên thông chứng Vô Sinh Nhẫn)...</li>
  </ul>
</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Mở Sáu Nút, 25 Pháp Môn Viên Thông, Niệm Phật Viên Thông, Bồ Tát Đại Thế Chí',
    noi_bat: 0
  },
  {
    vol: 6,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q6.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q06.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q06.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q06.webp',
    id: 'tt_klngl_q06',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 6',
    tom_tat: 'Quyển 6 khắc họa tuyệt đỉnh pháp môn Nhĩ Căn Viên Thông của Bồ Tát Quán Thế Âm, Bồ Tát Văn Thù tuyển chọn căn tu tối thắng cho cõi Ta-Bà, và Tứ Chủng Thanh Tịnh Minh Hối răn dạy giữ giới dâm, sát, đạo, vọng.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 6</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Đây là quyển cốt tủy của Kinh Lăng Nghiêm với pháp môn phản văn văn tự tính của Đức Quán Thế Âm Bồ Tát và bốn giới răn thanh tịnh minh bạch như mặt trời chiếu sáng, giúp người tu không lạc vào ma đạo.</p><h3>Nội dung chính Quyển 6:</h3><ul><li><strong>Quán Thế Âm Bồ Tát Nhĩ Căn Viên Thông:</strong> Pháp môn phản quan tự kỷ: 'Sơ ư văn trung, nhập lưu vong sở; sở nhập ký tịch, động tĩnh nhị tướng liễu nhiên bất sinh...', chứng đắc 32 ứng hóa thân cứu khổ và 14 năng lực vô úy mầu nhiệm.</li><li><strong>Văn Thù Sư Lợi Bồ Tát tuyển chọn viên thông:</strong> Tán thán pháp môn phản văn nhĩ căn là con đường thù thắng, hợp căn cơ chúng sinh cõi Ta-bà nhất để vượt thoát trần lao chứng quả Bồ-đề.</li><li><strong>Tứ Chủng Thanh Tịnh Minh Hối:</strong> Bốn lời răn dạy dứt khoát quyết định con đường giải thoát: dứt trừ tâm Dâm (dâm không trừ bụi trần chẳng ra), dứt trừ tâm Sát (sát sinh thì đền mạng lẫn nhau), dứt trừ tâm Đạo (trộm cắp đọa lạc), và dứt trừ Đại Vọng Ngữ (chưa chứng xưng chứng đọa địa ngục Vô Gián).</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Nhĩ Căn Viên Thông, Quán Thế Âm Bồ Tát, Tứ Chủng Thanh Tịnh Minh Hối, Giới Luật',
    noi_bat: 0
  },
  {
    vol: 7,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q7.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q07.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q07.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q07.webp',
    id: 'tt_klngl_q07',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 7',
    tom_tat: 'Quyển 7 chỉ dạy phương pháp kiến lập Đạo tràng Lăng Nghiêm thanh tịnh, tuyên thuyết toàn văn Thần Chú Đại Phật Đảnh Thủ Lăng Nghiêm (5 đệ chú), công đức trì chú bạt trừ nghiệp chướng và nguồn gốc 12 loài chúng sinh.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 7</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Quyển 7 là nền tảng mật giáo và hộ trì tu tập tối quan trọng, trang nghiêm đạo tràng, giải thích uy lực vô biên của chú Lăng Nghiêm và phơi bày nguyên do điên đảo lưu chuyển của mười hai loại chúng sinh.</p><h3>Nội dung chính Quyển 7:</h3><ul><li><strong>Phương pháp kiến lập Đạo tràng Lăng Nghiêm:</strong> Quy chuẩn thanh tịnh nghiêm ngặt về giới luật, tắm gội, kiến đàn, bài trí hoa quả hương đèn và lễ bái sám hối 21 ngày.</li><li><strong>Toàn văn Thần Chú Phật Đảnh Thủ Lăng Nghiêm:</strong> Tuyên thuyết đầy đủ 5 đệ thần chú cùng phân tích công năng hộ niệm vĩ đại: tiêu trừ nghiệp chướng muôn kiếp, phá tan ma chướng, tránh khỏi tai ương thủy hỏa đao binh độc dược.</li><li><strong>Hai nhân điên đảo & Mười hai loài chúng sinh:</strong> Nhân duyên vọng tưởng chấp trước sinh ra 12 loài: noãn sinh, thai sinh, thấp sinh, hóa sinh, hữu sắc, vô sắc, hữu tưởng, vô tưởng, phi hữu sắc, phi vô sắc, phi hữu tưởng, phi vô tưởng.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Thần Chú Lăng Nghiêm, Đạo Tràng Lăng Nghiêm, Mười Hai Loài Chúng Sinh, Mật Chú',
    noi_bat: 0
  },
  {
    vol: 8,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q8.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q08.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q08.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q08.webp',
    id: 'tt_klngl_q08',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 8',
    tom_tat: 'Quyển 8 giảng giải chi tiết lộ trình tu chứng sáu mươi địa vị Bồ Tát (từ Thập Tín, Thập Trụ đến Thập Địa, Diệu Giác) và phân tích nguyên nhân tạo nghiệp dẫn đến đọa lạc trong bảy cõi luân hồi (Địa ngục, Ngạ quỷ, Súc sinh, Người, Tiên, Trời, Tu-la).',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 8</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Quyển 8 vạch rõ bản đồ tu chứng của Đại Thừa Bồ Tát đạo từ sơ phát tâm đến quả vị Phật toàn giác, đồng thời cảnh tỉnh sâu sắc về định luật nhân quả tương ứng với mười tập nhân và sáu giao báo trong sáu nẻo luân hồi.</p><h3>Nội dung chính Quyển 8:</h3><ul><li><strong>Ba tiệm thứ tu tập:</strong> Trừ các trợ nhân (ăn chay, kiêng ngũ tân), kiềm giữ giới hạnh căn bản, và đi ngược dòng dục vọng trần cảnh.</li><li><strong>Sáu mươi giai vị Bồ Tát tu chứng:</strong> Càn Tuệ Địa, Thập Tín, Thập Trụ, Thập Hạnh, Thập Hồi Hướng, Tứ Gia Hạnh (Noãn, Đảnh, Nhẫn, Thế Đệ Nhất), Thập Địa (Hoan Hỷ Địa đến Pháp Vân Địa), Đẳng Giác và Diệu Giác viên mãn.</li><li><strong>Bảy cõi luân hồi nghiệp báo:</strong> Mười tập nhân và sáu giao báo của cõi Địa ngục; các loại Ngạ quỷ, Súc sinh, cõi Người, cõi Tiên, các tầng trời cõi Dục, cõi Sắc, cõi Vô Sắc và bốn loại Tu-la.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Địa Vị Bồ Tát, Thập Địa, Bảy Cõi Luân Hồi, Nhân Quả Báo Ứng, Tu Chứng',
    noi_bat: 0
  },
  {
    vol: 9,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q9.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q09.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q09.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q09.webp',
    id: 'tt_klngl_q09',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 9',
    tom_tat: 'Quyển 9 vạch trần hai mươi cảnh giới ấm ma đầu tiên trong Năm mươi hiện tượng ma sự lúc hành thiền: mười ma cảnh của Sắc Ấm và mười ma cảnh của Thọ Ấm, giúp hành giả giữ vững chánh niệm, không bị thiên ma cám dỗ lạc lối.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 9</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Kinh văn quyển 9 là cẩm nang hộ thân tối hậu cho mọi thiền giả. Khi tâm định phát khởi, ánh sáng tự tâm làm chấn động cung ma; ma vương phái ma ba-tuần trà trộn vào phá hoại người tu bằng những cảnh giới thần dị vi tế.</p><h3>Nội dung chính Quyển 9:</h3><ul><li><strong>Mười cảnh giới ma sự của Sắc Ấm:</strong> Thân thoát chướng ngại đi xuyên vách, tự lượm trùng sán trong thân, nghe tiếng thuyết pháp giữa hư không, thấy Phật hiện thân sáng rực, hư không biến thành bảy báu, nửa đêm thấy khắp phòng... Khai thị: nếu không chấp là thánh chứng thì tốt, chấp trước liền bị ma dựa.</li><li><strong>Mười cảnh giới ma sự của Thọ Ấm:</strong> Khởi lòng bi thương thái quá ngồi khóc không ngừng, khởi tâm cảm kích bái lạy cuồng nhiệt, khởi tâm kiêu mạn tự tôn là Phật, sinh tâm chán ngấy muốn tự tử, sinh lòng hoan hỷ vô hạn cười nói không dứt, chấp không đoạn diệt, tham cầu dục lạc...</li><li><strong>Nguyên tắc vàng phá ma:</strong> 'Bất tác thánh chứng, danh thiện cảnh giới; nhược tác thánh giải, tức thọ quần tà' (Chẳng nhận mình chứng Thánh thì là cảnh tốt; nếu nhận là chứng Thánh ắt bị ma dựa).</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Năm Mươi Ấm Ma, Sắc Ấm Ma, Thọ Ấm Ma, Thiền Định, Chánh Niệm',
    noi_bat: 0
  },
  {
    vol: 10,
    pdfSrc: 'BOOK GIANG KINH LN/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-10.pdf',
    pdfKey: 'pdfs/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q10.pdf',
    coverSrc: 'scratch/covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q10.webp',
    coverKey: 'covers/kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q10.webp',
    id: 'tt_klngl_q10',
    tieu_de: 'KINH THỦ LĂNG NGHIÊM LƯỢC GIẢNG - QUYỂN 10',
    tom_tat: 'Quyển 10 vạch rõ ba mươi cảnh giới ma sự vi tế còn lại thuộc Tưởng Ấm, Hành Ấm và Thức Ấm, giải thích Ngũ ấm giai không, nguồn gốc tiêu dung của ngũ ấm, cùng công đức thọ trì, biên chép và lưu thông Kinh Lăng Nghiêm.',
    noi_dung: `<p><strong>Kinh Đại Phật Đảnh Như Lai Mật Nhơn Tu Chứng Liễu Nghĩa Chư Bồ Tát Vạn Hạnh Thủ Lăng Nghiêm – Quyển 10</strong></p><p><em>Giảng giải: Đại Lão Hòa Thượng Tuyên Hóa (Vạn Phật Thánh Thành)</em></p><p>Quyển 10 hoàn tất bản trường ca phá trừ năm mươi ấm ma với các cảnh giới tà kiến triết học cực kỳ sâu kín trong Tưởng ấm, Hành ấm và Thức ấm, khép lại bằng lời huyền ký và tán thán công đức vô biên của người trì kinh trong thời mạt pháp.</p><h3>Nội dung chính Quyển 10:</h3><ul><li><strong>Mười cảnh giới ma của Tưởng Ấm:</strong> Lòng tham cầu thần thông kỳ lạ, tham cầu du hành các cõi, tham cầu bí mật huyền bí, tham biến hóa, tham túc mạng, tham thiền định tịch tĩnh... bị thiên ma ám nhập xưng là Phật sống, phá giới phạm hạnh.</li><li><strong>Mười cảnh giới ma của Hành Ấm:</strong> Rơi vào các kiến chấp triết học sai lệch: tà kiến vô nhân (vạn vật tự nhiên có), tà kiến chấp thường, chấp vừa thường vừa đoạn, chấp có biên vô biên, chấp bốn thứ luận thuyết đảo điên...</li><li><strong>Mười cảnh giới ma của Thức Ấm:</strong> Lầm nhận thức ấm sâu kín là chân tâm Niết-bàn cứu cánh, khởi tà kiến chấp ngã chấp pháp, tự cho mình ngang hàng chư Phật.</li><li><strong>Ngũ ấm giai không & Lưu thông phân:</strong> Đức Phật dạy cội nguồn năm ấm đều do vọng tưởng sinh khởi; ai có thể truyền bá, giảng giải, in ấn hay thọ trì kinh Lăng Nghiêm trong đời mạt pháp thì công đức ngang bằng cúng dường mười phương chư Phật.</li></ul>`,
    tags: 'Kinh Lăng Nghiêm, Hòa Thượng Tuyên Hóa, Năm Mươi Ấm Ma, Tưởng Ấm, Hành Ấm, Thức Ấm, Ngũ Ấm Giai Không, Công Đức Lưu Thông',
    noi_bat: 0
  }
];

function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function uploadToR2(bucket, key, localPath, contentType) {
  console.log(`Uploading ${key} (${contentType})...`);
  const cmd = `npx wrangler r2 object put "${bucket}/${key}" --file "${localPath}" --content-type "${contentType}" --remote`;
  const result = execFileSync('powershell', ['-Command', cmd], { encoding: 'utf8', stdio: 'pipe' });
  console.log(`  -> Done: ${key}`);
}

async function main() {
  const sqlStatements = [];
  const now = new Date().toISOString();
  const ngayDang = '15/09/2026';

  console.log('--- BƯỚC 1: UPLOAD TẤT CẢ FILE LÊN R2 ---');
  for (const b of books) {
    // 1. Upload PDF
    await uploadToR2('quangtu', b.pdfKey, b.pdfSrc, 'application/pdf');

    // 2. Upload Cover
    await uploadToR2('quangtu', b.coverKey, b.coverSrc, 'image/webp');

    // 3. Prepare media_objects SQL for PDF
    const pdfStats = fs.statSync(b.pdfSrc);
    const pdfSha = getSha256(b.pdfSrc);
    sqlStatements.push(`
INSERT INTO media_objects (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
VALUES (${escapeSql(b.pdfKey)}, ${escapeSql(b.pdfKey)}, ${pdfStats.size}, ${escapeSql(pdfSha)}, 'application/pdf', 'public, max-age=31536000, immutable', 1, ${escapeSql(now)}, NULL)
ON CONFLICT(object_key) DO UPDATE SET
  byte_size = excluded.byte_size,
  sha256 = excluded.sha256,
  content_type = excluded.content_type;
`);

    // 4. Prepare media_objects SQL for Cover
    const coverStats = fs.statSync(b.coverSrc);
    const coverSha = getSha256(b.coverSrc);
    sqlStatements.push(`
INSERT INTO media_objects (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
VALUES (${escapeSql(b.coverKey)}, ${escapeSql(b.coverKey)}, ${coverStats.size}, ${escapeSql(coverSha)}, 'image/webp', 'public, max-age=31536000, immutable', 1, ${escapeSql(now)}, NULL)
ON CONFLICT(object_key) DO UPDATE SET
  byte_size = excluded.byte_size,
  sha256 = excluded.sha256,
  content_type = excluded.content_type;
`);

    // 5. Prepare baiviet SQL
    sqlStatements.push(`
INSERT INTO baiviet (
  id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, link_ngoai,
  noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, created_at, updated_at, pdf_url
) VALUES (
  ${escapeSql(b.id)},
  ${escapeSql(b.tieu_de)},
  ${escapeSql(b.tom_tat)},
  ${escapeSql(b.noi_dung)},
  'KHÁC',
  ${escapeSql(b.tags)},
  'Hòa Thượng Tuyên Hóa',
  ${escapeSql(b.coverKey)},
  '',
  ${b.noi_bat},
  ${escapeSql(ngayDang)},
  0,
  0,
  'Hoàn thành',
  '[]',
  ${escapeSql(now)},
  ${escapeSql(now)},
  ${escapeSql(b.pdfKey)}
)
ON CONFLICT(id) DO UPDATE SET
  tieu_de = excluded.tieu_de,
  tom_tat = excluded.tom_tat,
  noi_dung = excluded.noi_dung,
  danh_muc = excluded.danh_muc,
  tags = excluded.tags,
  tac_gia = excluded.tac_gia,
  anh_url = excluded.anh_url,
  noi_bat = excluded.noi_bat,
  ngay_dang = excluded.ngay_dang,
  trang_thai = excluded.trang_thai,
  updated_at = excluded.updated_at,
  pdf_url = excluded.pdf_url;
`);
  }

  // Write SQL file
  const sqlFilePath = path.resolve('scratch/seed-lang-nghiem-books.sql');
  fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'), 'utf8');
  console.log(`Generated SQL file: ${sqlFilePath}`);

  console.log('--- BƯỚC 2: THỰC THI SQL VÀO REMOTE D1 DATABASE ---');
  const d1Cmd = `npx wrangler d1 execute DB --remote --config wrangler.sveltekit.jsonc --env production --file "${sqlFilePath}"`;
  const d1Output = execFileSync('powershell', ['-Command', d1Cmd], { encoding: 'utf8', stdio: 'pipe' });
  console.log(d1Output);

  console.log('HOÀN TẤT TẤT CẢ CÁC BƯỚC THÀNH CÔNG!');
}

main().catch(err => {
  console.error('Error occurred:', err);
  process.exit(1);
});
