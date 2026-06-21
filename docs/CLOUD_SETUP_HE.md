# הגדרת ענן לקלנופש

מטרת ההגדרה:

- Vercel יעלה גרסה חדשה אוטומטית בכל push ל-GitHub.
- Supabase ישמור נתונים משותפים לכל המשתמשים.
- משתמשים יתחברו עם אימייל וסיסמה.
- הצ׳אט יוכל להשתמש ב-GPT אם מוגדר מפתח OpenAI.

## 1. Supabase - הרצת סכמת בסיס נתונים

1. להיכנס ל-Supabase.
2. לבחור את הפרויקט של קלנופש.
3. ללכת ל-SQL Editor.
4. לפתוח את הקובץ `supabase/schema.sql`.
5. להדביק את כולו ולהריץ.

זה יוצר את הטבלאות:

- complexes
- leads
- availability_blocks
- lead_offers
- tasks
- profiles

## 2. Supabase - יצירת משתמשים

1. Supabase → Authentication → Users.
2. ללחוץ Add user.
3. להכניס אימייל וסיסמה.
4. ליצור משתמש לכל מי שאמור לעבוד באפליקציה.

אם Email confirmation מופעל, צריך לוודא שהמשתמש מסומן כ-confirmed או לכבות אימות אימייל בזמן ההקמה.

## 3. Supabase - מציאת URL ומפתח

1. Supabase → Project Settings.
2. API.
3. להעתיק:
   - Project URL
   - anon/public key או publishable key

אלה הערכים שצריך להכניס ל-Vercel.

## 4. Vercel - משתני סביבה

ב-Vercel:

1. להיכנס לפרויקט `kalanofesh-availability-app`.
2. Settings → Environment Variables.
3. להוסיף:

```text
VITE_SUPABASE_URL=<Project URL from Supabase>
VITE_SUPABASE_ANON_KEY=<anon/public or publishable key from Supabase>
OPENAI_API_KEY=<OpenAI API key, optional for GPT chat>
OPENAI_MODEL=gpt-4.1-mini
OPENAI_MAX_OUTPUT_TOKENS=450
OPENAI_MAX_ITEMS_PER_TABLE=80
OPENAI_MAX_MESSAGE_CHARS=4000
```

חשוב:

- לבחור Production לפחות.
- מומלץ לבחור גם Preview ו-Development אם Vercel מציע.
- אחרי שינוי משתנים חייבים Redeploy.
- ChatGPT Plus/Pro אינו אותו תקציב כמו OpenAI API. הצ׳אט באפליקציה משתמש בקרדיט/חיוב של חשבון OpenAI Platform שאליו שייך `OPENAI_API_KEY`.
- כדי שלא יעבור תקציב, להגדיר ב-OpenAI Platform מגבלת Usage/Budget של $10 לפרויקט של המפתח. המשתנים למעלה גם מצמצמים את כמות הטוקנים בכל קריאה.

## 5. Vercel - Redeploy

1. Vercel → Deployments.
2. לפתוח את ה-deployment האחרון.
3. ללחוץ שלוש נקודות.
4. Redeploy.

אחרי redeploy, האפליקציה תקרא את משתני הסביבה החדשים.

## 6. עדכונים אוטומטיים

הפרויקט מחובר ל-GitHub:

```text
efratanconina-tech/kalanofesh-availability-app
```

כל פעם שעושים push לענף `main`, Vercel אמור לבנות ולפרוס אוטומטית.

## 7. בדיקת חיבור

1. לפתוח את האפליקציה.
2. ללחוץ כניסה.
3. להתחבר עם משתמש שנוצר ב-Supabase Auth.
4. אם הצליח, הכותרת תציג:

```text
מצב: מחובר לענן
```

אם עדיין כתוב `מקומי`, אחת ההגדרות חסרה:

- אין משתמש ב-Supabase Auth.
- אחד ממשתני Vercel חסר או שגוי.
- לא נעשה Redeploy אחרי הוספת המשתנים.
- המשתמש לא confirmed.
