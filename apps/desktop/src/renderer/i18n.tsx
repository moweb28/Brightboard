import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const en = {
  tagline: 'Bright, simple online classes',
  heroLine1: 'Teach live.',
  heroLine2: 'Keep it simple.',
  heroPoints: ['Video, chat & screen share', 'Record every lesson', 'Free, no time limits'],
  joinTitle: 'Join your class',
  joinSubtitle: 'Paste the link or type the class code from your teacher.',
  classCode: 'Class link or code',
  codePlaceholder: 'ABC-123',
  yourName: 'Your name',
  namePlaceholder: 'e.g. Sara Ahmed',
  classPassword: 'Class password',
  joinButton: 'Join class',
  joining: 'Joining…',
  imTeacher: "I'm a teacher",
  teacherLogin: 'Welcome back, teacher',
  teacherRegister: 'Create your teacher account',
  teacherAuthSubtitle: 'Start classes and invite your students.',
  email: 'Email',
  password: 'Password',
  passwordHint: 'At least 8 characters',
  logIn: 'Log in',
  createAccount: 'Create account',
  pleaseWait: 'Please wait…',
  noAccount: 'New here? Create a teacher account',
  haveAccount: 'Already have an account? Log in',
  back: 'Back',
  logOut: 'Log out',
  startTitle: 'Start a class',
  startSubtitle: 'Pick a class password. Students need it to join.',
  classPasswordHint: '4–32 characters',
  startClass: 'Start class',
  starting: 'Starting…',
  invite: 'Invite',
  inviteTitle: 'Invite your students',
  inviteHint: 'Send this to your students on WhatsApp, email or any chat.',
  link: 'Link',
  code: 'Code',
  copyInvite: 'Copy invitation',
  copied: 'Copied!',
  inviteMessage: (link: string, code: string, pw: string) =>
    `Join my Brightboard class:\n${link}\n\nClass code: ${code}\nPassword: ${pw}`,
  teacher: 'Teacher',
  errors: {
    offline: "Can't reach the class server. Check your internet connection.",
    wrongPassword: 'Wrong class password.',
    notFound: 'No class found with that code.',
    tooMany: 'Too many wrong tries. Wait 10 minutes and try again.',
    emailTaken: 'This email already has an account. Log in instead.',
    wrongLogin: 'Wrong email or password.',
    badCode: 'That doesn’t look like a class link or code.',
    generic: 'Something went wrong. Please try again.',
  },
};

type Dict = typeof en;

const ar: Dict = {
  tagline: 'فصول أونلاين بسيطة ومشرقة',
  heroLine1: 'علّم مباشرة.',
  heroLine2: 'ببساطة.',
  heroPoints: ['فيديو ودردشة ومشاركة الشاشة', 'سجّل كل درس', 'مجاني وبدون حدود زمنية'],
  joinTitle: 'انضم إلى فصلك',
  joinSubtitle: 'الصق الرابط أو اكتب رمز الفصل من معلمك.',
  classCode: 'رابط أو رمز الفصل',
  codePlaceholder: 'ABC-123',
  yourName: 'اسمك',
  namePlaceholder: 'مثال: سارة أحمد',
  classPassword: 'كلمة مرور الفصل',
  joinButton: 'انضم إلى الفصل',
  joining: 'جارٍ الانضمام…',
  imTeacher: 'أنا معلم',
  teacherLogin: 'أهلاً بعودتك',
  teacherRegister: 'أنشئ حساب المعلم',
  teacherAuthSubtitle: 'ابدأ الفصول وادعُ طلابك.',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  passwordHint: '8 أحرف على الأقل',
  logIn: 'تسجيل الدخول',
  createAccount: 'إنشاء حساب',
  pleaseWait: 'يرجى الانتظار…',
  noAccount: 'جديد هنا؟ أنشئ حساب معلم',
  haveAccount: 'لديك حساب؟ سجّل الدخول',
  back: 'رجوع',
  logOut: 'تسجيل الخروج',
  startTitle: 'ابدأ فصلاً',
  startSubtitle: 'اختر كلمة مرور للفصل. سيحتاجها الطلاب للانضمام.',
  classPasswordHint: 'من 4 إلى 32 حرفاً',
  startClass: 'ابدأ الفصل',
  starting: 'جارٍ البدء…',
  invite: 'دعوة',
  inviteTitle: 'ادعُ طلابك',
  inviteHint: 'أرسل هذا لطلابك عبر واتساب أو البريد أو أي تطبيق دردشة.',
  link: 'الرابط',
  code: 'الرمز',
  copyInvite: 'نسخ الدعوة',
  copied: 'تم النسخ!',
  inviteMessage: (link, code, pw) => `انضم إلى فصلي على Brightboard:\n${link}\n\nرمز الفصل: ${code}\nكلمة المرور: ${pw}`,
  teacher: 'المعلم',
  errors: {
    offline: 'تعذّر الوصول إلى خادم الفصل. تحقق من اتصالك بالإنترنت.',
    wrongPassword: 'كلمة مرور الفصل غير صحيحة.',
    notFound: 'لا يوجد فصل بهذا الرمز.',
    tooMany: 'محاولات خاطئة كثيرة. انتظر 10 دقائق ثم حاول مجدداً.',
    emailTaken: 'هذا البريد لديه حساب بالفعل. سجّل الدخول بدلاً من ذلك.',
    wrongLogin: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    badCode: 'هذا لا يبدو رابطاً أو رمز فصل.',
    generic: 'حدث خطأ ما. حاول مرة أخرى.',
  },
};

export type Lang = 'en' | 'ar';
export type ErrorKey = keyof Dict['errors'];

const LANG_KEY = 'lang';
const I18nContext = createContext<{ t: Dict; lang: Lang; toggleLang: () => void } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en'));

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem(LANG_KEY, lang);
  }, [lang]);

  const toggleLang = () => setLang((l) => (l === 'en' ? 'ar' : 'en'));
  return <I18nContext.Provider value={{ t: lang === 'ar' ? ar : en, lang, toggleLang }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
