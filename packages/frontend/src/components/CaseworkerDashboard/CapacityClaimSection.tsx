import { useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

interface Props {
  user: KeycloakUser | null;
}

export default function CapacityClaimSection({ user }: Props) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManager = user?.roles?.includes('manager');

  if (!isManager) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Access restricted</h2>
          <p className="text-gray-400 text-sm">
            Only line managers can start a management capacity claim.
          </p>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4">✅</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Capacity claim started</h2>
          <p className="text-gray-500 text-sm mb-5">
            The intake task is waiting in the queue. Go to <strong>Projects → Tasks</strong> to fill
            in the consultation and classification form.
          </p>
          <button
            onClick={() => setStarted(false)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            Start another capacity claim
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Management capacity claim</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Start a capacity claim for your organisational unit. After consulting the HR Business
          Partner and the Personnel Controller, submit the claim to the Board of Directors. The
          first intake task will appear in your task queue after starting.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}
        <button
          onClick={async () => {
            setError(null);
            try {
              const res = await businessApi.process.start('ManagementCapacityClaimProcess', {});
              if (res.success) {
                setStarted(true);
              } else {
                setError('Capacity claim could not be started.');
              }
            } catch {
              setError('Capacity claim could not be started.');
            }
          }}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Start capacity claim
        </button>
      </div>
    </div>
  );
}
