// Owner: Role 1, Zihan. Previous team: Nick (8), Caeden (3).
// Part 17/17 of the feedback page: multi-language support (load order in feedback.html).
// ==================== MULTI-LANGUAGE SUPPORT ==================== done by Caeden

const translations = {
    en: {
        brandText: "RP Xperience Centre Feedback Portal",
        landingTitle: "Let's turn your ideas into reality",
        landingSubtitle: "Share your thoughts and help us improve our services. Your feedback matters.",
        startButton: "Start Feedback Form",
        pledgeboardButton: "📜 View Pledgeboards",
        qrHeader: "Scan for Mobile Feedback",
        qrDescription: "Point your mobile camera here to open the feedback form on your phone",

        consentTitle: "Quick Consent",
        consentDescription: "Pick how long we should keep your submission.",
        option7DaysTitle: "7 Days",
        option7DaysDescription: "Your feedback data will be deleted after 7 days.",
        optionLongTermTitle: "Long-Term",
        optionLongTermDescription: "Keep my data long-term for extended impact tracking",
        privacyNotice: "7 day Retention: Your photo and email is retained for 7 days then deleted. Your name and pledge may be displayed publicly.",
        continueFeedbackForm: "Continue to Feedback Form",

        detailsTitle: "Tell Us Who You Are",
        detailsDescription: "Just the essentials so we can send your photo.",
        nameLabel: "Name",
        emailLabel: "Email Address",
        namePlaceholder: "Enter your name",
        emailPlaceholder: "Enter your email",
        continueToFeedback: "Continue to Feedback",
        back: "Back",
        home: "Home", // Home button translation done by nick

        feedbackTitle: "Share Your Feedback",
        feedbackDescription: "A few quick taps. Honest answers are perfect.",
        continueToPledge: "Continue to Pledge",
        skipFeedback: "Skip Feedback",
        feedbackSkipped: "Feedback skipped",

        pledgeTitle: "Make Your Pledge",
        pledgeDescription: "Choose one action you can try after today.",
        pledgeExamplesHeader: "Smart Pledge Coach",
        pledgeExample1: "Carry a reusable bottle and cutlery every day",
        pledgeExample2: "Sort waste properly and recycle whenever possible",
        pledgeExample3: "Reduce food waste by taking only what I can finish",
        pledgeLabel: "Your Pledge",
        pledgeTopicLabel: "Choose your sustainability focus",
        pledgePlaceholder: "I pledge to...",
        charactersText: "500 characters",
        pledgePrivacy: "Your pledge will be displayed on our pledgeboard, inspiring others to take action",
        skipPledge: "I do not want to make a pledge",
        continueToPhoto: "Continue to Photo",
        photoChoiceTitle: "Would you like to take a photo?",
        photoChoiceDescription: "You can take a keepsake photo, or skip it and submit your feedback now.",
        takePhotoChoice: "Take Photo",
        skipPhotoChoice: "Skip Photo",

        photoTitle: "Capture Your Photo",
        photoDescription: "Your photo will sent to you through email",
        capturePhoto: "Capture Photo",

        uploadTitle: "Upload Your Photo",
        uploadDescription: "Please take a photo using your camera and upload it",
        uploadStep1: "Tap the button below to open your camera",
        uploadStep2: "Take a clear photo of yourself",
        uploadStep3: "Tap \"Use Photo\" to upload",
        uploadCamera: "Tap to Open Camera",
        uploadHint: "Your photo will be part of our community tree",
        continueToStyle: "Continue to Style Selection",
        retakeUpload: "Retake/Upload New Photo",

        styleTitle: "Choose Your Style",
        styleDescription: "Select your preferred overlay style for your RP memory photo!",
        availableOverlays: "Available Overlays",
        selectedLabel: "Selected:",
        useStyleContinue: "Use This Photo & Style & Continue",
        retakePhoto: "Retake Photo",

        confirmationTitle: "Confirm Submission",
        confirmationDescription: "Please review your information before submitting:",
        confirmName: "Name:",
        confirmEmail: "Email:",
        confirmQuestions: "Questions Answered:",
        confirmTheme: "Theme:",
        confirmRetention: "Data Retention:",
        confirmPledge: "Pledge:",
        confirmPhoto: "Photo:",
        confirmPhotoReady: "✅ Ready to be uploaded",
        confirmEmailPhoto: "Email Photo:",
        confirmEmailPhotoReady: "✅ Will be sent to your email",
        confirmPrimaryConsent: "Primary Consent:",
        confirmPrimaryConsentReady: "✅ Given",
        confirmationNote: "💡 You can go back to change the theme if needed",
        submitFeedback: "Submit Feedback",

        thankYouTitle: "Thank You! ☀️",
        thankYouMessage: "Your feedback has been recorded and a new leaf has been added to our digital tree!",
        emailSentTitle: "Your RP memory photo has been sent to your email!",
        emailSentDescription: "Please check your inbox within the next minute",
        thankYouFooter: "Thank you for contributing to our sustainability journey at Republic Polytechnic!",
        submitAnother: "Submit Another Feedback"
    },

    ms: {
        brandText: "Portal Maklum Balas Komuniti",
        landingTitle: "Mari jadikan idea anda satu kenyataan",
        landingSubtitle: "Kongsikan pandangan anda dan bantu kami menambah baik perkhidmatan kami. Maklum balas anda penting.",
        startButton: "Mula Borang Maklum Balas",
        pledgeboardButton: "📜 Lihat Papan Ikrar",
        qrHeader: "Imbas untuk Maklum Balas Mudah Alih",
        qrDescription: "Halakan kamera telefon anda di sini untuk membuka borang maklum balas pada telefon anda",

        consentTitle: "Persetujuan Penyimpanan Data",
        consentDescription: "Sebelum bermula, sila pilih tempoh masa anda mahu kami menyimpan data maklum balas anda",
        option7DaysTitle: "7 Hari",
        option7DaysDescription: "Data maklum balas anda akan dipadam selepas 7 hari.",
        optionLongTermTitle: "Jangka Panjang",
        optionLongTermDescription: "Simpan data saya untuk jangka panjang bagi penjejakan impak yang berterusan",
        privacyNotice: "Penyimpanan 7 hari: Foto dan e-mel anda disimpan selama 7 hari sebelum dipadam. Nama dan ikrar anda mungkin dipaparkan kepada umum.",
        continueFeedbackForm: "Teruskan ke Borang Maklum Balas",

        detailsTitle: "Butiran Anda",
        detailsDescription: "Sila masukkan nama dan e-mel anda untuk meneruskan",
        nameLabel: "Nama",
        emailLabel: "Alamat E-mel",
        namePlaceholder: "Masukkan nama anda",
        emailPlaceholder: "Masukkan e-mel anda",
        continueToFeedback: "Teruskan ke Maklum Balas",
        back: "Kembali",
        home: "Home", // Home button translation done by nick

        feedbackTitle: "Kongsi Maklum Balas Anda",
        feedbackDescription: "Pandangan anda membantu kami menambah baik dan melayani anda dengan lebih baik",
        continueToPledge: "Teruskan ke Ikrar",
        skipFeedback: "Langkau Maklum Balas",
        feedbackSkipped: "Maklum Balas Dilangkau",

        pledgeTitle: "Buat Ikrar Anda",
        pledgeDescription: "Kongsikan komitmen anda untuk memberi kesan positif",
        pledgeExamplesHeader: "Smart Pledge Coach",
        pledgeExample1: "Bawa botol dan sudu garpu guna semula setiap hari",
        pledgeExample2: "Asingkan sisa dengan betul dan kitar semula apabila boleh",
        pledgeExample3: "Kurangkan pembaziran makanan dengan mengambil hanya apa yang saya boleh habiskan",
        pledgeLabel: "Ikrar Anda",
        pledgePlaceholder: "Saya berikrar untuk...",
        charactersText: "500 aksara",
        pledgePrivacy: "Ikrar anda akan dipaparkan pada papan ikrar kami untuk memberi inspirasi kepada orang lain",
        skipPledge: "Saya tidak mahu membuat ikrar",
        continueToPhoto: "Teruskan ke Foto",

        photoTitle: "Ambil Foto Anda",
        photoDescription: "Foto anda akan dihantar kepada anda melalui e-mel",
        capturePhoto: "Ambil Foto",

        uploadTitle: "Muat Naik Foto Anda",
        uploadDescription: "Sila ambil foto menggunakan kamera anda dan muat naik",
        uploadStep1: "Tekan butang di bawah untuk membuka kamera anda",
        uploadStep2: "Ambil foto diri anda dengan jelas",
        uploadStep3: "Tekan \"Gunakan Foto\" untuk memuat naik",
        uploadCamera: "Tekan untuk Buka Kamera",
        uploadHint: "Foto anda akan menjadi sebahagian daripada pokok komuniti kami",
        continueToStyle: "Teruskan ke Pemilihan Gaya",
        retakeUpload: "Ambil Semula/Muat Naik Foto Baharu",

        styleTitle: "Pilih Gaya Anda",
        styleDescription: "Pilih gaya lapisan pilihan anda untuk foto memori RP anda!",
        availableOverlays: "Lapisan Tersedia",
        selectedLabel: "Dipilih:",
        useStyleContinue: "Gunakan Foto & Gaya Ini dan Teruskan",
        retakePhoto: "Ambil Semula Foto",

        confirmationTitle: "Sahkan Penghantaran",
        confirmationDescription: "Sila semak maklumat anda sebelum menghantar:",
        confirmName: "Nama:",
        confirmEmail: "E-mel:",
        confirmQuestions: "Soalan Dijawab:",
        confirmTheme: "Tema:",
        confirmRetention: "Penyimpanan Data:",
        confirmPledge: "Ikrar:",
        confirmPhoto: "Foto:",
        confirmPhotoReady: "✅ Sedia untuk dimuat naik",
        confirmEmailPhoto: "Foto E-mel:",
        confirmEmailPhotoReady: "✅ Akan dihantar ke e-mel anda",
        confirmPrimaryConsent: "Persetujuan Utama:",
        confirmPrimaryConsentReady: "✅ Diberikan",
        confirmationNote: "💡 Anda boleh kembali untuk menukar tema jika perlu",
        submitFeedback: "Hantar Maklum Balas",

        thankYouTitle: "Terima Kasih! ☀️",
        thankYouMessage: "Maklum balas anda telah direkodkan dan daun baharu telah ditambah pada pokok digital kami!",
        emailSentTitle: "Foto memori RP anda telah dihantar ke e-mel anda!",
        emailSentDescription: "Sila semak peti masuk anda dalam masa seminit",
        thankYouFooter: "Terima kasih kerana menyumbang kepada perjalanan kelestarian kami di Republic Polytechnic!",
        submitAnother: "Hantar Maklum Balas Lagi"
    },

    zh: {
        brandText: "社区反馈平台",
        landingTitle: "让您的想法成为现实",
        landingSubtitle: "分享您的想法，帮助我们改进服务。您的反馈很重要。",
        startButton: "开始反馈表",
        pledgeboardButton: "📜 查看承诺板",
        qrHeader: "扫描以使用手机反馈",
        qrDescription: "请将手机相机对准此处以在手机上打开反馈表",

        consentTitle: "数据保留同意",
        consentDescription: "在开始之前，请选择您希望我们保留您的反馈数据多长时间",
        option7DaysTitle: "7天",
        option7DaysDescription: "您的反馈数据将在7天后删除。",
        optionLongTermTitle: "长期",
        optionLongTermDescription: "长期保留我的数据以进行持续影响追踪",
        privacyNotice: "7天保留：您的照片和电子邮件将保留7天后删除。您的姓名和承诺可能会公开显示。",
        continueFeedbackForm: "继续到反馈表",

        detailsTitle: "您的资料",
        detailsDescription: "请输入您的姓名和电子邮件以继续",
        nameLabel: "姓名",
        emailLabel: "电子邮件地址",
        namePlaceholder: "请输入您的姓名",
        emailPlaceholder: "请输入您的电子邮件",
        continueToFeedback: "继续反馈",
        back: "返回",
        home: "Home", // Home button translation done by nick

        feedbackTitle: "分享您的反馈",
        feedbackDescription: "您的意见帮助我们改进并更好地为您服务",
        continueToPledge: "继续承诺",
        skipFeedback: "跳过反馈",
        feedbackSkipped: "已跳过反馈",

        pledgeTitle: "作出您的承诺",
        pledgeDescription: "分享您为带来积极影响所作的承诺",
        pledgeExamplesHeader: "Smart Pledge Coach",
        pledgeExample1: "每天携带可重复使用的水瓶和餐具",
        pledgeExample2: "正确分类垃圾并尽可能回收",
        pledgeExample3: "只拿自己能吃完的食物以减少浪费",
        pledgeLabel: "您的承诺",
        pledgePlaceholder: "我承诺……",
        charactersText: "500个字符",
        pledgePrivacy: "您的承诺将显示在我们的承诺板上，激励其他人采取行动",
        skipPledge: "我不想作出承诺",
        continueToPhoto: "继续到照片",

        photoTitle: "拍摄您的照片",
        photoDescription: "您的照片将通过电子邮件发送给您",
        capturePhoto: "拍摄照片",

        uploadTitle: "上传您的照片",
        uploadDescription: "请使用相机拍照并上传",
        uploadStep1: "点击下方按钮打开相机",
        uploadStep2: "清楚地拍摄您自己的照片",
        uploadStep3: "点击“使用照片”以上传",
        uploadCamera: "点击打开相机",
        uploadHint: "您的照片将成为我们社区树的一部分",
        continueToStyle: "继续选择样式",
        retakeUpload: "重新拍摄/上传新照片",

        styleTitle: "选择您的样式",
        styleDescription: "为您的RP回忆照片选择您喜欢的叠加样式！",
        availableOverlays: "可用叠加层",
        selectedLabel: "已选择：",
        useStyleContinue: "使用此照片和样式并继续",
        retakePhoto: "重新拍摄照片",

        confirmationTitle: "确认提交",
        confirmationDescription: "提交前请检查您的信息：",
        confirmName: "姓名：",
        confirmEmail: "电子邮件：",
        confirmQuestions: "已回答问题：",
        confirmTheme: "主题：",
        confirmRetention: "数据保留：",
        confirmPledge: "承诺：",
        confirmPhoto: "照片：",
        confirmPhotoReady: "✅ 准备上传",
        confirmEmailPhoto: "邮件照片：",
        confirmEmailPhotoReady: "✅ 将发送到您的电子邮件",
        confirmPrimaryConsent: "主要同意：",
        confirmPrimaryConsentReady: "✅ 已给予",
        confirmationNote: "💡 如有需要，您可以返回更改主题",
        submitFeedback: "提交反馈",

        thankYouTitle: "谢谢您！☀️",
        thankYouMessage: "您的反馈已被记录，我们的数字树上新增了一片叶子！",
        emailSentTitle: "您的RP回忆照片已发送到您的电子邮件！",
        emailSentDescription: "请在一分钟内检查您的收件箱",
        thankYouFooter: "感谢您为Republic Polytechnic的可持续发展之旅作出贡献！",
        submitAnother: "再次提交反馈"
    },

    ta: {
        brandText: "சமூக கருத்து தளம்",
        landingTitle: "உங்கள் எண்ணங்களை நனவாக்கலாம்",
        landingSubtitle: "உங்கள் கருத்துகளை பகிர்ந்து எங்கள் சேவைகளை மேம்படுத்த உதவுங்கள். உங்கள் பின்னூட்டம் முக்கியமானது.",
        startButton: "பின்னூட்டப் படிவத்தை தொடங்கு",
        pledgeboardButton: "📜 உறுதிமொழி பலகையை காண்க",
        qrHeader: "மொபைல் பின்னூட்டத்திற்காக ஸ்கேன் செய்யவும்",
        qrDescription: "உங்கள் தொலைபேசியில் பின்னூட்டப் படிவத்தைத் திறக்க உங்கள் கேமராவை இங்கு நோக்குங்கள்",

        consentTitle: "தரவு சேமிப்பு ஒப்புதல்",
        consentDescription: "தொடங்குவதற்கு முன், உங்கள் பின்னூட்டத் தரவை எவ்வளவு காலம் வைத்திருக்க விரும்புகிறீர்கள் என்பதைத் தேர்ந்தெடுக்கவும்",
        option7DaysTitle: "7 நாட்கள்",
        option7DaysDescription: "உங்கள் பின்னூட்டத் தரவு 7 நாட்களுக்கு பிறகு நீக்கப்படும்.",
        optionLongTermTitle: "நீண்ட காலம்",
        optionLongTermDescription: "தொடர்ந்த தாக்கத்தை கண்காணிக்க எனது தரவை நீண்ட காலம் வைத்திருக்கவும்",
        privacyNotice: "7 நாள் சேமிப்பு: உங்கள் புகைப்படமும் மின்னஞ்சலும் 7 நாட்கள் வைத்திருந்து பின்னர் நீக்கப்படும். உங்கள் பெயரும் உறுதிமொழியும் பொதுவாக காட்டப்படலாம்.",
        continueFeedbackForm: "பின்னூட்டப் படிவத்திற்கு தொடர்க",

        detailsTitle: "உங்கள் விவரங்கள்",
        detailsDescription: "தொடர உங்கள் பெயர் மற்றும் மின்னஞ்சலை வழங்கவும்",
        nameLabel: "பெயர்",
        emailLabel: "மின்னஞ்சல் முகவரி",
        namePlaceholder: "உங்கள் பெயரை உள்ளிடவும்",
        emailPlaceholder: "உங்கள் மின்னஞ்சலை உள்ளிடவும்",
        continueToFeedback: "பின்னூட்டத்திற்கு தொடர்க",
        back: "பின்",
        home: "Home", // Home button translation done by nick

        feedbackTitle: "உங்கள் பின்னூட்டத்தை பகிரவும்",
        feedbackDescription: "உங்கள் கருத்துக்கள் எங்களை மேம்படுத்தவும் உங்களுக்கு சிறப்பாக சேவை செய்யவும் உதவுகின்றன",
        continueToPledge: "உறுதிமொழிக்கு தொடர்க",
        skipFeedback: "பின்னூட்டத்தை தவிர்க்கவும்",
        feedbackSkipped: "பின்னூட்டம் தவிர்க்கப்பட்டது",

        pledgeTitle: "உங்கள் உறுதிமொழியை வழங்கவும்",
        pledgeDescription: "நல்ல மாற்றத்தை உருவாக்கும் உங்கள் உறுதிப்பாட்டைப் பகிரவும்",
        pledgeExamplesHeader: "Smart Pledge Coach",
        pledgeExample1: "ஒவ்வொரு நாளும் மறுபயன்பாட்டு தண்ணீர் பாட்டிலும் உபகரணங்களும் எடுத்துச் செல்லுங்கள்",
        pledgeExample2: "கழிவுகளை சரியாக பிரித்து இயன்றபோது மறுசுழற்சி செய்யுங்கள்",
        pledgeExample3: "நான் முடிக்க முடியும் அளவிற்கு மட்டுமே உணவை எடுத்து உணவு வீணாவதை குறைப்பேன்",
        pledgeLabel: "உங்கள் உறுதிமொழி",
        pledgePlaceholder: "நான் உறுதிமொழி எடுக்கிறேன்...",
        charactersText: "500 எழுத்துகள்",
        pledgePrivacy: "உங்கள் உறுதிமொழி எங்கள் உறுதிமொழி பலகையில் காட்டப்படும், இது பிறரையும் செயல்பட தூண்டும்",
        skipPledge: "நான் உறுதிமொழி வழங்க விரும்பவில்லை",
        continueToPhoto: "புகைப்படத்திற்கு தொடர்க",

        photoTitle: "உங்கள் புகைப்படத்தை எடுக்கவும்",
        photoDescription: "உங்கள் புகைப்படம் மின்னஞ்சல் மூலம் உங்களுக்கு அனுப்பப்படும்",
        capturePhoto: "புகைப்படம் எடு",

        uploadTitle: "உங்கள் புகைப்படத்தை பதிவேற்றவும்",
        uploadDescription: "தயவுசெய்து உங்கள் கேமராவைப் பயன்படுத்தி ஒரு புகைப்படம் எடுத்து பதிவேற்றவும்",
        uploadStep1: "உங்கள் கேமராவைத் திறக்க கீழே உள்ள பொத்தானை அழுத்தவும்",
        uploadStep2: "உங்கள் தெளிவான புகைப்படத்தை எடுக்கவும்",
        uploadStep3: "\"Use Photo\" என்பதை அழுத்தி பதிவேற்றவும்",
        uploadCamera: "கேமராவைத் திறக்கத் தட்டவும்",
        uploadHint: "உங்கள் புகைப்படம் எங்கள் சமூக மரத்தின் ஒரு பகுதியாக இருக்கும்",
        continueToStyle: "பாணி தேர்விற்கு தொடர்க",
        retakeUpload: "மீண்டும் எடுக்க/புதிய புகைப்படம் பதிவேற்ற",

        styleTitle: "உங்கள் பாணியைத் தேர்ந்தெடுக்கவும்",
        styleDescription: "உங்கள் RP நினைவு புகைப்படத்திற்கான விருப்ப ஓவர்லே பாணியைத் தேர்ந்தெடுக்கவும்!",
        availableOverlays: "கிடைக்கும் ஓவர்லேக்கள்",
        selectedLabel: "தேர்ந்தெடுக்கப்பட்டது:",
        useStyleContinue: "இந்த புகைப்படம் & பாணியை பயன்படுத்தி தொடர்க",
        retakePhoto: "மீண்டும் புகைப்படம் எடு",

        confirmationTitle: "சமர்ப்பிப்பை உறுதிப்படுத்தவும்",
        confirmationDescription: "சமர்ப்பிக்கும் முன் உங்கள் தகவலை சரிபார்க்கவும்:",
        confirmName: "பெயர்:",
        confirmEmail: "மின்னஞ்சல்:",
        confirmQuestions: "பதிலளிக்கப்பட்ட கேள்விகள்:",
        confirmTheme: "தீம்:",
        confirmRetention: "தரவு சேமிப்பு:",
        confirmPledge: "உறுதிமொழி:",
        confirmPhoto: "புகைப்படம்:",
        confirmPhotoReady: "✅ பதிவேற்ற தயாராக உள்ளது",
        confirmEmailPhoto: "மின்னஞ்சல் புகைப்படம்:",
        confirmEmailPhotoReady: "✅ உங்கள் மின்னஞ்சலுக்கு அனுப்பப்படும்",
        confirmPrimaryConsent: "முதன்மை ஒப்புதல்:",
        confirmPrimaryConsentReady: "✅ வழங்கப்பட்டது",
        confirmationNote: "💡 தேவைப்பட்டால் தீமையை மாற்ற நீங்கள் பின்னோக்கி செல்லலாம்",
        submitFeedback: "பின்னூட்டத்தை சமர்ப்பிக்கவும்",

        thankYouTitle: "நன்றி! ☀️",
        thankYouMessage: "உங்கள் பின்னூட்டம் பதிவு செய்யப்பட்டுள்ளது மற்றும் எங்கள் டிஜிட்டல் மரத்தில் ஒரு புதிய இலை சேர்க்கப்பட்டுள்ளது!",
        emailSentTitle: "உங்கள் RP நினைவு புகைப்படம் உங்கள் மின்னஞ்சலுக்கு அனுப்பப்பட்டுள்ளது!",
        emailSentDescription: "அடுத்த ஒரு நிமிடத்திற்குள் உங்கள் இன்பாக்ஸைச் சரிபார்க்கவும்",
        thankYouFooter: "Republic Polytechnic இன் நிலைத்தன்மை பயணத்திற்கு நீங்கள் வழங்கிய பங்களிப்பிற்கு நன்றி!",
        submitAnother: "மற்றொரு பின்னூட்டத்தை சமர்ப்பிக்கவும்"
    }
};

let currentLanguage = localStorage.getItem('kioskLanguage') || 'en';

// Extra translations for dynamic database questions, progress labels and controls. (Done by Caeden)
const dynamicLanguageText = {
    en: {
        flowSteps: { consent: 'Consent', details: 'Details', feedback: 'Feedback', pledge: 'Pledge', photo: 'Photo', confirm: 'Confirm' },
        answerPlaceholder: 'Type your answer here...',
        yes: 'Yes',
        no: 'No',
        home: 'Home',
        noQuestionsTitle: 'No Questions Available',
        noQuestionsDescription: 'Please contact the administrator to set up feedback questions.',
        noQuestionsButton: 'No Questions Available',
        requiredQuestion: 'Please answer the highlighted question before moving on.',
        questionsAnswered: count => `${count} questions answered`,
        feedbackSkipped: 'Feedback skipped',
        selectFocusArea: 'Select a focus area',
        knownText: {
            'how would you rate your experience?': 'How would you rate your experience?',
            'what did you learn today?': 'What did you learn today?',
            'which topic interested you most?': 'Which topic interested you most?',
            'climate change': 'Climate Change',
            'renewable energy': 'Renewable Energy',
            'sustainable living': 'Sustainable Living',
            'ocean conservation': 'Ocean Conservation',
            'ethical governance': 'Ethical Governance',
            'community impact': 'Community Impact'
        }
    },
    zh: {
        flowSteps: { consent: '同意', details: '资料', feedback: '反馈', pledge: '承诺', photo: '照片', confirm: '确认' },
        answerPlaceholder: '请在这里输入您的回答...',
        yes: '是',
        no: '否',
        home: '主页',
        noQuestionsTitle: '暂无问题',
        noQuestionsDescription: '请联系管理员设置反馈问题。',
        noQuestionsButton: '暂无问题',
        requiredQuestion: '请回答高亮显示的问题后再继续。',
        questionsAnswered: count => `已回答 ${count} 个问题`,
        feedbackSkipped: '已跳过反馈',
        selectFocusArea: '请选择关注领域',
        knownText: {
            'how would you rate your experience?': '您会如何评价您的体验？',
            'what did you learn today?': '您今天学到了什么？',
            'which topic interested you most?': '您最感兴趣的主题是什么？',
            'climate change': '气候变化',
            'renewable energy': '可再生能源',
            'sustainable living': '可持续生活',
            'ocean conservation': '海洋保护',
            'ethical governance': '道德治理',
            'community impact': '社区影响'
        }
    },
    ms: {
        flowSteps: { consent: 'Persetujuan', details: 'Butiran', feedback: 'Maklum Balas', pledge: 'Ikrar', photo: 'Foto', confirm: 'Sahkan' },
        answerPlaceholder: 'Taip jawapan anda di sini...',
        yes: 'Ya',
        no: 'Tidak',
        home: 'Laman Utama',
        noQuestionsTitle: 'Tiada Soalan',
        noQuestionsDescription: 'Sila hubungi pentadbir untuk menetapkan soalan maklum balas.',
        noQuestionsButton: 'Tiada Soalan',
        requiredQuestion: 'Sila jawab soalan yang ditandakan sebelum meneruskan.',
        questionsAnswered: count => `${count} soalan dijawab`,
        feedbackSkipped: 'Maklum Balas Dilangkau',
        selectFocusArea: 'Pilih bidang fokus',
        knownText: {
            'how would you rate your experience?': 'Bagaimanakah anda menilai pengalaman anda?',
            'what did you learn today?': 'Apakah yang anda pelajari hari ini?',
            'which topic interested you most?': 'Topik manakah yang paling menarik minat anda?',
            'climate change': 'Perubahan Iklim',
            'renewable energy': 'Tenaga Boleh Baharu',
            'sustainable living': 'Kehidupan Lestari',
            'ocean conservation': 'Pemuliharaan Lautan',
            'ethical governance': 'Tadbir Urus Beretika',
            'community impact': 'Impak Komuniti'
        }
    },
    ta: {
        flowSteps: { consent: 'ஒப்புதல்', details: 'விவரங்கள்', feedback: 'பின்னூட்டம்', pledge: 'உறுதிமொழி', photo: 'புகைப்படம்', confirm: 'உறுதி' },
        answerPlaceholder: 'உங்கள் பதிலை இங்கே தட்டச்சு செய்யவும்...',
        yes: 'ஆம்',
        no: 'இல்லை',
        home: 'முகப்பு',
        noQuestionsTitle: 'கேள்விகள் இல்லை',
        noQuestionsDescription: 'பின்னூட்டக் கேள்விகளை அமைக்க நிர்வாகியைத் தொடர்பு கொள்ளவும்.',
        noQuestionsButton: 'கேள்விகள் இல்லை',
        requiredQuestion: 'தொடருவதற்கு முன் குறிக்கப்பட்ட கேள்விக்கு பதிலளிக்கவும்.',
        questionsAnswered: count => `${count} கேள்விகள் பதிலளிக்கப்பட்டன`,
        feedbackSkipped: 'பின்னூட்டம் தவிர்க்கப்பட்டது',
        selectFocusArea: 'கவனப் பகுதியைத் தேர்ந்தெடுக்கவும்',
        knownText: {
            'how would you rate your experience?': 'உங்கள் அனுபவத்தை எவ்வாறு மதிப்பிடுவீர்கள்?',
            'what did you learn today?': 'இன்று நீங்கள் என்ன கற்றுக்கொண்டீர்கள்?',
            'which topic interested you most?': 'எந்த தலைப்பு உங்களுக்கு மிகவும் ஆர்வமளித்தது?',
            'climate change': 'காலநிலை மாற்றம்',
            'renewable energy': 'புதுப்பிக்கத்தக்க ஆற்றல்',
            'sustainable living': 'நிலையான வாழ்க்கை',
            'ocean conservation': 'கடல் பாதுகாப்பு',
            'ethical governance': 'நெறிமுறை ஆட்சி',
            'community impact': 'சமூக தாக்கம்'
        }
    }
};

function getDynamicLanguageText() {
    return dynamicLanguageText[currentLanguage] || dynamicLanguageText.en;
}

function translateKnownDynamicText(text) {
    const source = String(text || '').trim();
    const key = source.toLowerCase();
    return getDynamicLanguageText().knownText[key] || source;
}

function setText(id, value) {
    document.querySelectorAll(`#${id}, [data-text-target="${id}"]`).forEach(el => {
        el.textContent = value;
    });
}

function setPlaceholder(id, value) {
    const el = document.getElementById(id);
    if (el) el.placeholder = value;
}

function setSelectOptionText(selectId, value, text) {
    const option = document.querySelector(`#${selectId} option[value="${value}"]`);
    if (option) option.textContent = text;
    const topicLabel = document.querySelector(`[data-topic-label="${value}"]`);
    if (topicLabel) topicLabel.textContent = text;
}

function updateLanguageButtons() {
    document.querySelectorAll('.language-selector button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === currentLanguage) {
            btn.classList.add('active');
        }
    });
}

function updateProgressLanguage() {
    const labels = getDynamicLanguageText().flowSteps;
    document.querySelectorAll('.progress-step').forEach(stepEl => {
        const key = stepEl.dataset.step;
        const labelEl = stepEl.querySelector('.progress-label');
        if (labelEl && labels[key]) {
            labelEl.textContent = labels[key];
        }
    });
}

function translateRenderedQuestions() {
    const dynamicText = getDynamicLanguageText();

    document.querySelectorAll('#questions-container .question-label').forEach(label => {
        const original = label.dataset.originalText;
        const number = label.dataset.questionNumber;
        const required = label.dataset.required === 'true' ? ' *' : '';
        if (original && number) {
            label.textContent = `${number}. ${translateKnownDynamicText(original)}${required}`;
        }
    });

    document.querySelectorAll('#questions-container textarea').forEach(textarea => {
        textarea.placeholder = dynamicText.answerPlaceholder;
    });

    document.querySelectorAll('#questions-container [data-dynamic-option]').forEach(option => {
        const original = option.dataset.originalText;
        if (original) {
            const lower = original.toLowerCase();
            option.textContent = lower === 'yes'
                ? dynamicText.yes
                : (lower === 'no' ? dynamicText.no : translateKnownDynamicText(original));
        }
    });
}

function applyTranslations() {
    const t = translations[currentLanguage];
    if (!t) return;

    setText('brand-text', t.brandText);
    setText('form-landing-title', t.landingTitle);
    setText('form-landing-subtitle', t.landingSubtitle);
    setText('start-feedback-btn', t.startButton);
    setText('view-pledgeboards-btn', t.pledgeboardButton);
    setText('qr-header-text', t.qrHeader);

    const qrDescription = document.getElementById('qr-description-text');
    if (qrDescription && !qrDescription.innerHTML.includes('Scan to open:')) {
        qrDescription.textContent = t.qrDescription;
    }

    setText('consent-title', t.consentTitle);
    setText('consent-description', t.consentDescription);
    setText('option-7days-title', t.option7DaysTitle);
    setText('option-7days-description', t.option7DaysDescription);
    setText('option-longterm-title', t.optionLongTermTitle);
    setText('option-longterm-description', t.optionLongTermDescription);
    setText('privacy-notice-text', t.privacyNotice);
    setText('continue-feedback-form-text', t.continueFeedbackForm);

    setText('details-title', t.detailsTitle);
    setText('details-description', t.detailsDescription);
    setText('name-label', t.nameLabel);
    setText('email-label', t.emailLabel);
    setPlaceholder('user-name', t.namePlaceholder);
    setPlaceholder('user-email', t.emailPlaceholder);
    setText('continue-to-feedback-text', t.continueToFeedback);
    setText('back-from-details-text', t.back);

    setText('feedback-title', t.feedbackTitle);
    setText('feedback-description', t.feedbackDescription);
    setText('continue-to-pledge-text', t.continueToPledge);
    //added by zihan
    setText('skip-feedback-text', t.skipFeedback);
    setText('back-from-feedback-text', t.back);
     setText('home-from-feedback-text', getDynamicLanguageText().home); // Home button translation done by nick

    setText('pledge-title', t.pledgeTitle);
    setText('pledge-description', t.pledgeDescription);
    setText('pledge-examples-header', t.pledgeExamplesHeader);
    setText('pledge-label', t.pledgeLabel);
    setText('pledge-topic-label', t.pledgeTopicLabel || 'Choose your sustainability focus');
    setSelectOptionText('pledge-topic', '', getDynamicLanguageText().selectFocusArea);
    setSelectOptionText('pledge-topic', 'climate-change', translateKnownDynamicText('Climate Change'));
    setSelectOptionText('pledge-topic', 'renewable-energy', translateKnownDynamicText('Renewable Energy'));
    setSelectOptionText('pledge-topic', 'sustainable-living', translateKnownDynamicText('Sustainable Living'));
    setSelectOptionText('pledge-topic', 'ocean-conservation', translateKnownDynamicText('Ocean Conservation'));
    setSelectOptionText('pledge-topic', 'ethical-governance', translateKnownDynamicText('Ethical Governance'));
    setSelectOptionText('pledge-topic', 'community-impact', translateKnownDynamicText('Community Impact'));
    setPlaceholder('pledge-text', t.pledgePlaceholder);
    setText('characters-text', t.charactersText);
    setText('pledge-privacy-text', t.pledgePrivacy);
    setText('continue-to-photo-text', t.continueToPhoto);
    setText('skip-pledge-text', t.skipPledge);
    setText('back-from-pledge-text', t.back);
    setText('home-from-pledge-text', getDynamicLanguageText().home); // Home button translation (DONE BY NICK)

    setText('photo-choice-title', t.photoChoiceTitle || 'Would you like to take a photo?');
    setText('photo-choice-description', t.photoChoiceDescription || 'You can take a keepsake photo, or skip it and submit your feedback now.');
    setText('take-photo-choice-text', t.takePhotoChoice || t.continueToPhoto || 'Take Photo');
    setText('skip-photo-choice-text', t.skipPhotoChoice || 'Skip Photo');
    setText('back-from-photo-choice-text', t.back);

    setText('photo-title', t.photoTitle);
    setText('photo-description', t.photoDescription);
    setText('capture-photo-text', t.capturePhoto);
    setText('back-from-photo-text', t.back);

    setText('upload-title', t.uploadTitle);
    setText('upload-description', t.uploadDescription);
    setText('upload-step-1', t.uploadStep1);
    setText('upload-step-2', t.uploadStep2);
    setText('upload-step-3', t.uploadStep3);
    setText('upload-camera-text', t.uploadCamera);
    setText('upload-hint-text', t.uploadHint);
    setText('continue-to-style-text', t.continueToStyle);
    setText('back-from-upload-text', t.back);
    setText('retake-upload-text', t.retakeUpload);

    setText('style-title', t.styleTitle);
    setText('style-description', t.styleDescription);
    setText('available-overlays-title', t.availableOverlays);
    setText('selected-label-text', t.selectedLabel);
    setText('use-style-continue-text', t.useStyleContinue);
    setText('retake-photo-text', t.retakePhoto);

    setText('confirmation-title', t.confirmationTitle);
    setText('confirmation-description', t.confirmationDescription);
    setText('confirm-name-label', t.confirmName);
    setText('confirm-email-label', t.confirmEmail);
    setText('confirm-questions-label', t.confirmQuestions);
    setText('confirm-theme-label', t.confirmTheme);
    setText('confirm-retention-label', t.confirmRetention); // changes made by nick
    setText('confirm-pledge-label', t.confirmPledge);
    setText('confirm-photo-label', t.confirmPhoto);
    setText('confirm-photo-ready', t.confirmPhotoReady);
    setText('confirm-email-photo-label', t.confirmEmailPhoto);
    setText('confirm-email-photo-ready', t.confirmEmailPhotoReady);
    setText('confirmation-note-text', t.confirmationNote);
    setText('submit-feedback-text', t.submitFeedback);
    setText('back-from-confirmation-text', t.back);

    setText('thankyou-title', t.thankYouTitle);
    setText('thankyou-message', t.thankYouMessage);
    setText('email-sent-title', t.emailSentTitle);
    setText('email-sent-description', t.emailSentDescription);
    setText('thankyou-footer-text', t.thankYouFooter);
    setText('submit-another-btn', t.submitAnother);
    setText('thankyou-pledgeboards-btn', t.pledgeboardButton);

    updateLanguageButtons();
    updateProgressLanguage();
    translateRenderedQuestions();
    applyParameterOverrides();
}

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLanguage = lang;
    localStorage.setItem('kioskLanguage', lang);
    document.documentElement.lang = lang;
    applyTranslations();
    if (activeFlowPageId) { // Refresh multilingual RP guide after language switch (DONE BY NICK)
        updateRpBearCompanion(activeFlowPageId);
    }
}

// Physical keyboard shortcuts for changing language: Alt+1 English, Alt+2 Chinese, Alt+3 Malay, Alt+4 Tamil. (Done by Caeden)
function handleLanguageShortcut(event) {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;

    const shortcuts = {
        '1': 'en',
        '2': 'zh',
        '3': 'ms',
        '4': 'ta'
    };

    const lang = shortcuts[event.key];
    if (!lang) return;

    event.preventDefault();
    setLanguage(lang);
}

// apply once page is ready
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('keydown', handleLanguageShortcut);
    setTimeout(() => {
        applyTranslations();
    }, 100);
});
