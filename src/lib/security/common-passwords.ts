/**
 * Passwords that attackers try first. Each one meets the basic complexity
 * rules, which is exactly why a length-and-symbols check alone is not enough.
 *
 * This is the free alternative to Supabase's paid "leaked password protection"
 * (HaveIBeenPwned). Compared case-insensitively after removing spaces.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  [
    "password@123", "password@1234", "password#123", "password!123", "password@1", "p@ssw0rd", "p@ssword1",
    "p@ssw0rd123", "pass@123", "pass@1234", "pa$$w0rd", "passw0rd!", "admin@123", "admin@1234", "admin#123",
    "administrator@1", "welcome@123", "welcome@1234", "welcome#1", "welcome1!", "qwerty@123", "qwerty@1234",
    "qwerty#123", "qwerty123!", "asdf@1234", "zxcv@1234", "abcd@1234", "abcd@123", "abc@1234", "abc@12345",
    "abcd#1234", "test@123", "test@1234", "test#123", "user@123", "user@1234", "login@123", "temp@123",
    "changeme@1", "default@123", "letmein@1", "iloveyou@1", "iloveyou@123", "i love you@1", "sunshine@1",
    "princess@1", "football@1", "cricket@123", "cricket@1", "dhoni@007", "virat@18", "sachin@10",
    "india@123", "india@1234", "india#123", "india@2024", "india@2025", "india@2026", "bharat@123",
    "jaihind@123", "jai@hind1", "hindustan@1", "mumbai@123", "delhi@123", "newdelhi@1", "kolkata@123",
    "chennai@123", "bangalore@1", "hyderabad@1", "pune@1234", "lucknow@123", "jaipur@123", "patna@123",
    "saharanpur@1", "varanasi@1", "krishna@123", "krishna@1", "radhe@123", "radhekrishna@1", "shiva@123",
    "jaishreeram@1", "jaishriram@1", "sairam@123", "omsairam@1", "ganesh@123", "hanuman@123", "durga@123",
    "laxmi@123", "allah@123", "waheguru@1", "jesus@123", "god@12345", "mother@123", "father@123",
    "family@123", "love@1234", "baby@1234", "sweety@123", "monkey@123", "dragon@123", "master@123",
    "shadow@123", "superman@1", "batman@123", "india@12345", "company@123", "office@123", "sangam@123",
    "arunarya@1", "arunarya@123", "odop@1234", "artisan@123", "seller@123", "buyer@123", "trader@123",
    "summer@2025", "summer@2026", "winter@2025", "winter@2026", "monday@123", "january@1", "october@1",
    "aa@123456", "aa@12345", "a@123456", "a@1234567", "a1b2c3d4@", "aa1234@@", "1q2w3e4r@", "1q2w3e@4r",
    "q1w2e3r4@", "zaq1@wsx", "1qaz@wsx", "qazwsx@123", "!qaz2wsx", "1234@abcd", "12345@abc", "123@abcd",
    "123@abc", "1234@qwer", "12345678@a", "a12345678@", "abc123!@#", "abcdef@1", "abcdefg@1", "aaaa@1111",
    "1111@aaaa", "pass@word1", "mypassword@1", "my@password1", "secret@123", "secure@123", "hello@123",
    "hello@1234", "welcome@2025", "welcome@2026", "india@2023", "pakistan@1", "nepal@123", "dubai@123",
  ].map((p) => p.toLowerCase()),
);
