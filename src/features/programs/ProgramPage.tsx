import { useEffect, useState } from 'react';
import type { UserProgram } from '../../domain/types';
import { getUserProgram } from './api';

export default function ProgramPage() {
  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserProgram()
      .then(setUserProgram)
      .catch(err => setError(err.message ?? 'Failed to load program'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="program-loading">Loading plan…</div>;
  if (error) return <div className="program-error">Error: {error}</div>;
  if (!userProgram?.program) {
    return (
      <div className="program-page">
        <h1 className="page-title">🏋️ Training Plan</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No program assigned yet.</p>
      </div>
    );
  }

  const { program } = userProgram;
  const content = program.content;

  return (
    <div className="program-page">
      <div className="page-header-bar">
        <h1 className="page-title">🏋️ {program.title}</h1>
        {program.description && (
          <p className="program-description">{program.description}</p>
        )}
      </div>

      <div className="program-grid">
        {content?.daily_structure && (
          <section className="app-card">
            <h2>🍽️ Daily Nutrition Structure</h2>
            <ul className="program-list">
              {content.daily_structure.morning && (
                <li>
                  <span className="program-label">Morning:</span>{' '}
                  {content.daily_structure.morning}
                </li>
              )}
              {content.daily_structure.lunch && (
                <li>
                  <span className="program-label">Lunch:</span>{' '}
                  {content.daily_structure.lunch}
                </li>
              )}
              {content.daily_structure.dinner && (
                <li>
                  <span className="program-label">Dinner:</span>{' '}
                  {content.daily_structure.dinner}
                </li>
              )}
              {content.daily_structure.protein_target && (
                <li>
                  <span className="program-label">Protein target:</span>{' '}
                  {content.daily_structure.protein_target}
                </li>
              )}
            </ul>
          </section>
        )}

        {content?.weekly_structure && (
          <section className="app-card">
            <h2>📅 Weekly Fasting Strategy</h2>
            <ul className="program-list">
              {content.weekly_structure.fast_days != null && (
                <li>
                  <span className="program-label">Fast days per week:</span>{' '}
                  {content.weekly_structure.fast_days}
                </li>
              )}
              {content.weekly_structure.standard_days != null && (
                <li>
                  <span className="program-label">Standard eating days:</span>{' '}
                  {content.weekly_structure.standard_days}
                </li>
              )}
              {content.weekly_structure.description && (
                <li>{content.weekly_structure.description}</li>
              )}
            </ul>
          </section>
        )}

        {content?.walking && (
          <section className="app-card">
            <h2>🚶 Walking / Cardio</h2>
            <ul className="program-list">
              {content.walking.frequency && (
                <li>
                  <span className="program-label">Frequency:</span>{' '}
                  {content.walking.frequency}
                </li>
              )}
              {content.walking.duration && (
                <li>
                  <span className="program-label">Duration:</span>{' '}
                  {content.walking.duration}
                </li>
              )}
            </ul>
          </section>
        )}

        {content?.strength_training && (
          <section className="app-card">
            <h2>💪 Strength Training</h2>
            <ul className="program-list">
              {content.strength_training.days != null && (
                <li>
                  <span className="program-label">Days per week:</span>{' '}
                  {content.strength_training.days}
                </li>
              )}
              {content.strength_training.schedule &&
                content.strength_training.schedule.length > 0 && (
                  <li>
                    <span className="program-label">Schedule:</span>{' '}
                    {content.strength_training.schedule.join(', ')}
                  </li>
                )}
            </ul>
            {content.strength_training.exercises &&
              content.strength_training.exercises.length > 0 && (
                <div className="exercise-list">
                  <h3>Exercises</h3>
                  <ol>
                    {content.strength_training.exercises.map((ex, idx) => (
                      <li key={idx}>{ex}</li>
                    ))}
                  </ol>
                </div>
              )}
          </section>
        )}
      </div>
    </div>
  );
}
