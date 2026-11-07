export type GitaWisdomSituation =
  | 'mock_setback'
  | 'result_anxiety'
  | 'procrastination'
  | 'consistency'
  | 'self_doubt'
  | 'comparison'
  | 'general';

export interface GitaWisdomEntry {
  id: string;
  chapter: number;
  verse: number;
  theme: string;
  situations: GitaWisdomSituation[];
  devanagari: string;
  transliteration: string;
  meaningHindi: string;
  practicalApplication: string;
  canonicalSource: string;
}

const GITA_WISDOM: GitaWisdomEntry[] = [
  {
    id: '2.47',
    chapter: 2,
    verse: 47,
    theme: 'Karma Yoga — focus on action without attachment to results',
    situations: ['result_anxiety', 'general'],
    devanagari:
      'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥',
    transliteration:
      'karmaṇy-evādhikāras te mā phaleṣu kadācana; mā karma-phala-hetur bhūr mā te saṅgo ’stv akarmaṇi.',
    meaningHindi:
      'आपका अधिकार अपने कर्तव्य-कर्म पर है, उसके फल पर नियंत्रण का दावा नहीं। फल की चिंता को कर्म का एकमात्र कारण न बनने दें और निष्क्रियता से भी आसक्त न हों।',
    practicalApplication:
      'GATE की rank और marks की चिंता में ऊर्जा खर्च करने के बजाय आज के निर्धारित PYQs, revision और mock-analysis को ईमानदारी से पूरा कीजिए। लक्ष्य रखें, पर रोज़ का ध्यान अपने नियंत्रित प्रयास और सुधार पर रखें।',
    canonicalSource: 'https://heritage.iitk.ac.in/SBG/2.47',
  },
  {
    id: '2.48',
    chapter: 2,
    verse: 48,
    theme: 'Equanimity — remain balanced in success and failure',
    situations: ['mock_setback', 'general'],
    devanagari:
      'योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।\nसिद्ध्यसिद्ध्योः समो भूत्वा समत्वं योग उच्यते॥',
    transliteration:
      'yoga-sthaḥ kuru karmāṇi saṅgaṁ tyaktvā dhanañjaya; siddhy-asiddhyoḥ samo bhūtvā samatvaṁ yoga ucyate.',
    meaningHindi:
      'हे धनञ्जय, आसक्ति छोड़कर अपना कर्म करो और सफलता-असफलता में मन का संतुलन बनाए रखो। यही समत्व योग कहलाता है।',
    practicalApplication:
      'कम marks वाला mock आपकी पूरी क्षमता का फैसला नहीं है। परिणाम को शांत मन से देखिए, गलतियों को वर्गीकृत कीजिए और अगली तैयारी में सुधार लागू कीजिए।',
    canonicalSource: 'https://heritage.iitk.ac.in/SBG/2.48',
  },
  {
    id: '3.8',
    chapter: 3,
    verse: 8,
    theme: 'Duty — take the necessary action rather than remaining inactive',
    situations: ['procrastination'],
    devanagari:
      'नियतं कुरु कर्म त्वं कर्म ज्यायो ह्यकर्मणः।\nशरीरयात्रापि च ते न प्रसिद्ध्येदकर्मणः॥',
    transliteration:
      'niyataṁ kuru karma tvaṁ karma jyāyo hy akarmaṇaḥ; śarīra-yātrāpi ca te na prasiddhyed akarmaṇaḥ.',
    meaningHindi:
      'अपने नियत कर्तव्य-कर्म को करो, क्योंकि निष्क्रियता की अपेक्षा कर्म श्रेष्ठ है।',
    practicalApplication:
      'जब पढ़ाई शुरू करना कठिन लगे, तो पूरे दिन के बारे में सोचकर रुकिए मत। अभी सिर्फ़ 25 मिनट का एक स्पष्ट काम शुरू कीजिए—जैसे पाँच Pipelining PYQs और उनका analysis।',
    canonicalSource: 'https://heritage.iitk.ac.in/SBG/3.8',
  },
  {
    id: '3.19',
    chapter: 3,
    verse: 19,
    theme: 'Consistent, unattached action',
    situations: ['consistency'],
    devanagari:
      'तस्मादसक्तः सततं कार्यं कर्म समाचर।\nअसक्तो ह्याचरन्कर्म परमाप्नोति पूरुषः॥',
    transliteration:
      'tasmād asaktaḥ satataṁ kāryaṁ karma samācar; asakto hy ācaran karma param āpnoti pūruṣaḥ.',
    meaningHindi:
      'इसलिए आसक्ति से मुक्त होकर निरंतर अपना कर्तव्य-कर्म करते रहो।',
    practicalApplication:
      'तैयारी में स्थायी सुधार रोज़ के छोटे, दोहराए गए सही अभ्यास से आता है। Revision, PYQ practice और test analysis का नियमित चक्र बनाए रखिए।',
    canonicalSource: 'https://heritage.iitk.ac.in/SBG/3.19',
  },
  {
    id: '6.5',
    chapter: 6,
    verse: 5,
    theme: 'Self-discipline — elevate yourself through your own effort',
    situations: ['self_doubt'],
    devanagari:
      'उद्धरेदात्मनात्मानं नात्मानमवसादयेत्।\nआत्मैव ह्यात्मनो बन्धुरात्मैव रिपुरात्मनः॥',
    transliteration:
      'uddhared ātmanātmānaṁ nātmānam avasādayet; ātmaiva hy ātmano bandhur ātmaiva ripur ātmanaḥ.',
    meaningHindi:
      'मनुष्य को अपने प्रयास से स्वयं को ऊपर उठाना चाहिए, स्वयं को निराशा में नहीं धकेलना चाहिए। अनुशासित मन सहायक बनता है और अनियंत्रित मन बाधा।',
    practicalApplication:
      'जब आत्म-संदेह या distraction बढ़े, तो खुद को दोष देने के बजाय environment और अगले छोटे action को व्यवस्थित कीजिए। आज एक weak topic पर focused practice से शुरुआत करें।',
    canonicalSource: 'https://heritage.iitk.ac.in/SBG/6.5',
  },
  {
    id: '18.47',
    chapter: 18,
    verse: 47,
    theme: 'Svadharma — follow your own responsibility, not another person’s path',
    situations: ['comparison'],
    devanagari:
      'श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात्।\nस्वभावनियतं कर्म कुर्वन्नाप्नोति किल्बिषम्॥',
    transliteration:
      'śreyān sva-dharmo viguṇaḥ para-dharmāt sv-anuṣṭhitāt; svabhāva-niyataṁ karma kurvan nāpnoti kilbiṣam.',
    meaningHindi:
      'अपना कर्तव्य, भले ही उसे पूरी तरह निपुणता से न किया गया हो, किसी दूसरे के कर्तव्य की नकल करने से श्रेष्ठ है।',
    practicalApplication:
      'दूसरे aspirants की speed या mock marks से अपनी तैयारी को मत मापिए। अपने पिछले प्रदर्शन, अपनी गलतियों और अपने अगले सुधार की तुलना कीजिए।',
    canonicalSource: 'https://heritage.iitk.ac.in/SBG/18.47',
  },
];

const inferSituation = (input: string): GitaWisdomSituation => {
  const text = input.toLowerCase();
  if (/mock|test|low marks|poor score|bad score|failed|demotivat|कम अंक|कम marks/.test(text)) return 'mock_setback';
  if (/air|rank|result|marks|exam result|परिणाम|रैंक/.test(text)) return 'result_anxiety';
  if (/procrastinat|start studying|can't start|cannot start|avoid study|आलस|टाल/.test(text)) return 'procrastination';
  if (/consisten|routine|streak|regular|नियमित/.test(text)) return 'consistency';
  if (/self.?doubt|doubt myself|confidence|discipline|distraction|निराश|आत्मविश्वास/.test(text)) return 'self_doubt';
  if (/compar|others|other aspirants|someone else|दूसरे|तुलना/.test(text)) return 'comparison';
  return 'general';
};

export const getContextualGitaShloka = (situation = '') => {
  const selectedSituation = inferSituation(situation);
  const entry =
    GITA_WISDOM.find((item) => item.situations.includes(selectedSituation)) ||
    GITA_WISDOM[0];

  return {
    source: 'Curated canonical Bhagavad Gita verse. Sanskrit text and chapter/verse reference are checked against Heritage IIT Kanpur.',
    selectedSituation,
    ...entry,
    interpretationNote:
      'The Hindi meaning and preparation application are explanatory interpretations for this conversation, not additional Sanskrit text or a claim that the Gita specifically discusses modern examinations.',
  };
};

export const getGitaWisdomCatalog = () =>
  GITA_WISDOM.map(({ id, chapter, verse, theme, situations, canonicalSource }) => ({
    id,
    chapter,
    verse,
    theme,
    situations,
    canonicalSource,
  }));
