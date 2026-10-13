import { Link } from 'react-router-dom'

import Logo from '../layouts/Logo'
import { buttonClasses } from '../components/ui'
import { useDocumentTitle } from '../hooks/useUi'

const CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated October 2026',
    intro:
      'Warranto is built to keep your purchase records private. This policy explains what information the product stores and how it is used.',
    sections: [
      {
        heading: 'Information we store',
        body: 'Your account details (name and email address), the products you add, and the bills you upload. Nothing else is collected without your knowledge.',
      },
      {
        heading: 'How it is used',
        body: 'Records are used to show your warranty status, calculate expiry dates and send the reminders you enable in Settings. Your data is never sold or shared for advertising.',
      },
      {
        heading: 'Bill storage',
        body: 'Uploaded bills are stored securely and only accessible from your account. You can replace or delete a bill at any time from the product page.',
      },
      {
        heading: 'Reminders',
        body: 'If email reminders are enabled, your email address is used solely to send warranty expiry notifications. You can turn them off in Settings.',
      },
      {
        heading: 'Deleting your account',
        body: 'You can request deletion of your account and all associated records at any time. Deletion is permanent and removes every stored bill.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'Last updated October 2026',
    intro:
      'These terms govern your use of Warranto. By creating an account you agree to them.',
    sections: [
      {
        heading: 'Using Warranto',
        body: 'Warranto is a personal records tool. You are responsible for the accuracy of the product details, purchase dates and bills you add.',
      },
      {
        heading: 'Warranty information',
        body: 'Expiry dates are calculated from the purchase date and warranty duration you provide. Warranto is an organiser — the manufacturer or seller remains the authority on any warranty claim.',
      },
      {
        heading: 'Your account',
        body: 'Keep your login credentials private and notify us if you suspect unauthorised access to your account.',
      },
      {
        heading: 'Availability',
        body: 'We work to keep Warranto available, but the service may occasionally be interrupted for maintenance. Your stored records are preserved across updates.',
      },
      {
        heading: 'Changes to these terms',
        body: 'We may update these terms as the product evolves. Continued use after a change means you accept the revised terms.',
      },
    ],
  },
}

export function LegalPage({ type = 'privacy' }) {
  const page = CONTENT[type] ?? CONTENT.privacy
  useDocumentTitle(page.title)

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5 sm:px-6">
          <Logo />
          <Link
            to="/"
            className="text-sm font-medium text-muted transition hover:text-brand-300"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6">
        <article className="anim-slide-up rounded-xl border border-line bg-surface p-6 shadow-card sm:p-9">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{page.title}</h1>
          <p className="mt-2 text-[13px] text-muted">{page.updated}</p>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-soft">{page.intro}</p>

          <div className="mt-8 space-y-7">
            {page.sections.map((section, index) => (
              <section key={section.heading}>
                <h2 className="text-[16px] font-semibold text-ink">
                  {index + 1}. {section.heading}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{section.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-9 border-t border-line pt-6">
            <Link to="/register" className={buttonClasses({ size: 'md' })}>
              Get Started with Warranto
            </Link>
          </div>
        </article>
      </main>

      <footer className="border-t border-line py-6">
        <p className="text-center text-[13px] text-muted">
          © {new Date().getFullYear()} Warranto. All rights reserved.
        </p>
      </footer>
    </div>
  )
}

export default LegalPage
