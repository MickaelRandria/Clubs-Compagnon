import { createContext, useContext, useState, type ReactNode } from 'react';
import { CoachModal } from './CoachModal';

interface CoachContextValue {
  isOpen: boolean;
  openCoach: (initialQuestion?: string) => void;
  closeCoach: () => void;
  initialQuestion: string | null;
}

const CoachContext = createContext<CoachContextValue | null>(null);

export function CoachProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);

  const openCoach = (question?: string) => {
    setInitialQuestion(question ?? null);
    setIsOpen(true);
  };

  const closeCoach = () => {
    setIsOpen(false);
    setInitialQuestion(null);
  };

  return (
    <CoachContext.Provider value={{ isOpen, openCoach, closeCoach, initialQuestion }}>
      {children}
      <CoachModal isOpen={isOpen} onClose={closeCoach} defaultQuestion={initialQuestion} />
    </CoachContext.Provider>
  );
}

export function useCoach() {
  const context = useContext(CoachContext);
  if (!context) {
    throw new Error('useCoach must be used within a CoachProvider');
  }
  return context;
}

