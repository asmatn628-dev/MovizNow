import { useEffect, useRef } from 'react';

export function useModalBehavior(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(`modal_${Date.now()}_${Math.random()}`);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const modalId = modalIdRef.current;

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.modalId !== modalId) {
        onCloseRef.current();
      }
    };

    window.history.pushState({ modalId }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('popstate', handlePopState);
      
      if (window.history.state?.modalId === modalId) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
