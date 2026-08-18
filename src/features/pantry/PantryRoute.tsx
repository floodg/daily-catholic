import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import PantryPage from './PantryPage';

export default function PantryRoute() {
  const [searchParams] = useSearchParams();
  const ingredient = searchParams.get('ingredient')?.trim() ?? '';

  useEffect(() => {
    if (!ingredient) return;

    const targetName = ingredient.toLocaleLowerCase();
    let observer: MutationObserver | null = null;
    let timeoutId: number | null = null;

    const clearHighlights = () => {
      document
        .querySelectorAll<HTMLElement>('.pantry-item-card-linked')
        .forEach((card) => card.classList.remove('pantry-item-card-linked'));
    };

    const findAndFocus = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.pantry-item-card'));
      const match = cards.find((card) => {
        const name = card.querySelector<HTMLElement>('.pantry-item-name')?.textContent?.trim();
        return name?.toLocaleLowerCase() === targetName;
      });

      if (!match) return false;

      clearHighlights();
      match.classList.add('pantry-item-card-linked');
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    };

    if (!findAndFocus()) {
      observer = new MutationObserver(() => {
        if (findAndFocus()) {
          observer?.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timeoutId = window.setTimeout(() => {
        observer?.disconnect();
        observer = null;
      }, 5000);
    }

    return () => {
      observer?.disconnect();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      clearHighlights();
    };
  }, [ingredient]);

  return (
    <>
      <PantryPage />
      <style>{`
        .pantry-item-card-linked {
          outline: 2px solid var(--gold);
          outline-offset: 2px;
          box-shadow: 0 0 0 4px rgba(201, 168, 76, 0.16);
          scroll-margin-top: 5rem;
        }
      `}</style>
    </>
  );
}
