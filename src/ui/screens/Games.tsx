// Partije (/partije): sve moje aktivne/lobi partije (D1 preko api.myGames).
// Završene partije žive u Istoriji.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@state/authStore';
import { api } from '@net/api';
import { currentUserId } from '@net/auth';
import { hasOnlineEnv } from '@net/config';
import type { MyGame } from '@/protocol/messages';
import { MyGamesList } from '../components/MyGamesList';
import { NewGameSheet } from '../components/NewGameSheet';

export default function Games() {
  const me = useAuthStore((s) => s.me);
  const [games, setGames] = useState<MyGame[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const online = hasOnlineEnv();

  useEffect(() => {
    document.title = 'Partije - Prefa';
  }, []);

  useEffect(() => {
    if (!online) return;
    if (!currentUserId()) {
      setGames([]);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const list = await api.myGames();
        if (alive) setGames(list);
      } catch {
        if (alive) setGames([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [online, me]);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-4 pb-6 pt-5">
      <h1 className="font-mono text-2xl font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008]">
        Partije
      </h1>

      {!online ? (
        <p className="border border-[#c9c9c9] bg-[#f6f6f2] p-3 font-mono text-[12px] font-bold text-black/60 shadow-[3px_4px_0_#4d1008]">
          Online igra nije podešena za ovaj build.
        </p>
      ) : (
        <>
          <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]">
            <div className="bg-[#ececea] px-3 py-2 font-bold">U toku</div>
            <div className="p-3">
              {games === null ? (
                <p className="text-[12px] text-black/45">Učitavanje...</p>
              ) : games.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-[12px] text-black/45">Nemaš započetih online partija.</p>
                  <button
                    onClick={() => setNewOpen(true)}
                    className="w-full border border-black/40 bg-[#1597ee] px-4 py-3 font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]"
                  >
                    ＋ Nova partija
                  </button>
                </div>
              ) : (
                <MyGamesList games={games} />
              )}
            </div>
          </section>

          <p className="px-1 font-mono text-[11px] leading-4 text-black/50">
            Završene partije su u{' '}
            <Link to="/history" className="font-bold text-[#0c4f9f] underline underline-offset-2">
              Istoriji
            </Link>
            . Kad si na potezu, stiže i push obaveštenje (ako si ga uključio).
          </p>
        </>
      )}

      <NewGameSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </main>
  );
}
