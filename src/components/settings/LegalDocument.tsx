import type { LegalDocument as LegalDocumentType } from '@/constants/legal'

interface LegalDocumentProps {
  document: LegalDocumentType
}

export function LegalDocument({ document }: LegalDocumentProps) {
  return (
    <article className="legal-document">
      <header className="legal-document-header">
        <p className="legal-document-subtitle">{document.subtitle}</p>
        <p className="legal-document-updated">
          Son güncelleme: <time>{document.lastUpdated}</time>
        </p>
      </header>

      <div className="legal-document-body">
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className="legal-section">
            <h2 className="legal-section-title">{section.title}</h2>
            {section.paragraphs.map((paragraph, i) => (
              <p key={i} className="legal-paragraph">
                {paragraph}
              </p>
            ))}
            {section.bullets && section.bullets.length > 0 && (
              <ul className="legal-list">
                {section.bullets.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
