// Početna — dashboard: hero, „＋ Nova partija" (unificiran tok: kompjuteri ili
// drugari), „Priključi se kodom" i pregled partija u toku. Bez gornje trake na
// mobilnom (navigacija je u donjem TabBar-u); desktop header daje TabLayout.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@state/authStore';
import { api } from '@net/api';
import { currentUserId } from '@net/auth';
import { hasOnlineEnv } from '@net/config';
import type { MyGame } from '@/protocol/messages';
import { NewGameSheet } from '../components/NewGameSheet';
import { JoinSheet } from '../components/JoinSheet';
import { MyGamesList } from '../components/MyGamesList';

export default function Home() {
  const me = useAuthStore((s) => s.me);
  const loadMe = useAuthStore((s) => s.loadMe);

  const [newOpen, setNewOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [myGames, setMyGames] = useState<MyGame[]>([]);

  const online = hasOnlineEnv();

  useEffect(() => {
    document.title = 'Prefa';
    if (online) void loadMe();
  }, [online, loadMe]);

  // lista prati identitet: posle odjave (me → null) prazni se, posle prijave se učita
  useEffect(() => {
    if (!online) return;
    if (!currentUserId()) {
      setMyGames([]);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const games = await api.myGames();
        if (alive) setMyGames(games);
      } catch {
        /* lista je best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, [online, me]);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-4 pb-6 pt-5 sm:pt-8">
      <section className="relative border border-[#00572d] bg-[#087f45] shadow-[5px_6px_0_#4d1008]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_42px),linear-gradient(rgba(255,255,255,0.06)_0_1px,transparent_1px_42px)] opacity-30" />
        <div className="relative p-5">
          <h1 className="font-mono text-[38px] font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008] sm:text-[44px]">
            Prefa
          </h1>
          <p className="mt-3 max-w-[400px] font-mono text-sm font-bold leading-6 text-white/80">
            Preferans u troje — protiv kompjutera ili online sa drugarima.
          </p>
        </div>
      </section>

      {!online ? (
        <p className="border border-[#c9c9c9] bg-[#f6f6f2] p-3 font-mono text-[12px] font-bold text-black/60 shadow-[3px_4px_0_#4d1008]">
          Igra još nije podešena za ovaj build (nedostaje konfiguracija servera).
        </p>
      ) : (
        <>
          <button
            onClick={() => setNewOpen(true)}
            className="w-full border border-black/40 bg-[#1597ee] px-4 py-3.5 font-mono text-[15px] font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]"
          >
            ＋ Nova partija
          </button>
          <button
            onClick={() => setJoinOpen(true)}
            className="w-full border border-black/35 bg-[#f7f7f2] px-4 py-3 font-mono font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]"
          >
            # Priključi se kodom
          </button>

          <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]">
            <div className="flex items-center justify-between bg-[#ececea] px-3 py-2">
              <span className="font-bold">U toku</span>
              {myGames.length > 0 && (
                <Link to="/partije" className="text-[12px] font-bold text-[#0c4f9f] underline underline-offset-2">
                  sve →
                </Link>
              )}
            </div>
            <div className="p-3">
              {myGames.length === 0 ? (
                <p className="text-[12px] text-black/45">Nemaš započetih online partija.</p>
              ) : (
                <MyGamesList games={myGames} limit={5} />
              )}
            </div>
          </section>
        </>
      )}

      <NewGameSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
    </main>
  );
}
