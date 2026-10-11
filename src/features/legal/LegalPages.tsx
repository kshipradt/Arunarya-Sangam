/**
 * Plain-language DRAFTS, pending review by a lawyer and the operating
 * company's details. English only until finalised, then translated.
 */
const OPERATOR = "[Operating company: legal name, registered address, CIN/GSTIN — to be filled]";
const GRIEVANCE = "[Grievance Officer: name, email, phone — to be filled]";

function DraftBanner() {
  return (
    <p className="alert alert-info" role="note">
      Draft for review. This text will be finalised by a lawyer before ARUNARYA Sangam opens for orders.
    </p>
  );
}

export function TermsPage() {
  return (
    <article className="container narrow page-pad legal" lang="en" dir="ltr">
      <h1>Terms of Use</h1>
      <DraftBanner />
      <p>ARUNARYA Sangam ("Sangam") is an online marketplace and network operated by {OPERATOR}. Sangam is an independent platform and is not affiliated with any government body.</p>
      <h2>Your account</h2>
      <ul>
        <li>Give true information about yourself and your business, and keep your password private.</li>
        <li>You are responsible for activity on your account. Tell us at once if you think someone else has used it.</li>
        <li>Each person may hold one account per role. Accounts made by automated means are not allowed.</li>
      </ul>
      <h2>Selling on Sangam</h2>
      <ul>
        <li>Sellers must describe products honestly, including where and by whom they were made, and must hold any registrations the law requires, such as GST.</li>
        <li>Sellers are responsible for the quality, safety and lawful sale of their products.</li>
      </ul>
      <h2>Buying on Sangam</h2>
      <ul>
        <li>Prices, delivery charges and return windows are shown before you pay.</li>
        <li>Complaints are acknowledged within 48 hours and resolved within one month, as the Consumer Protection (E-Commerce) Rules, 2020 require.</li>
      </ul>
      <h2>Not allowed</h2>
      <ul>
        <li>Counterfeit or illegal goods, misleading claims, false reviews, spam, and attempts to break or overload the service.</li>
      </ul>
      <h2>Grievances</h2>
      <p>{GRIEVANCE}</p>
    </article>
  );
}

export function PrivacyPage() {
  return (
    <article className="container narrow page-pad legal" lang="en" dir="ltr">
      <h1>Privacy Policy</h1>
      <DraftBanner />
      <p>This policy explains what personal data {OPERATOR} collects through ARUNARYA Sangam, why, and your rights under the Digital Personal Data Protection Act, 2023.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account: name, email address and an encrypted password.</li>
        <li>Profile: your role (buyer, artisan, business owner or trader), business name, country, state, city, ODOP district and preferred language.</li>
        <li>Contact numbers you choose to add. They are shown to another member only after you both accept a connection.</li>
        <li>Orders and delivery addresses, when shopping opens.</li>
        <li>Security data: a bot-protection check by Cloudflare Turnstile, and basic logs to prevent abuse.</li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>To run your account, show products in your language, match buyers with makers, and deliver orders.</li>
        <li>To keep the platform safe from fraud and automated attacks.</li>
        <li>We do not sell your personal data.</li>
      </ul>
      <h2>Where it is stored</h2>
      <p>On managed cloud servers operated by Supabase. Passwords are stored only as one-way hashes.</p>
      <h2>Your rights</h2>
      <ul>
        <li>See, correct or download your data, withdraw consent, and delete your account from your account settings or by writing to us.</li>
        <li>Order records needed for tax and accounting are kept with personal links removed.</li>
      </ul>
      <h2>Contact and grievances</h2>
      <p>{GRIEVANCE}</p>
    </article>
  );
}
