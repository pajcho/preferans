// ─────────────────────────────────────────────────────────────
// Nalog (opciona registracija): status naloga za trenutni identitet.
// Registracija NE menja userId (istorija partija ostaje); prijava na
// nalog ZAMENJUJE identitet uređaja onim od naloga (isti na svim
// uređajima); odjava briše identitet — sledeći put se tiho pravi nov
// anoniman. `me` se kešira u localStorage radi brzog headera, a osveži
// se sa servera pri učitavanju.
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MeResponse, UpdateProfileRequest } from '@/protocol/messages';
import { api } from '@net/api';
import { clearIdentity, currentUserId, setIdentity } from '@net/auth';
import { useOnlineStore } from './onlineStore';

interface AuthStore {
  me: MeResponse | null;
  /** osveži status naloga sa servera (bez identiteta = niko — ne pravi ga) */
  loadMe: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  updateProfile: (patch: UpdateProfileRequest) => Promise<void>;
  logout: () => void;
}

/** ime naloga je i ime za stolom — drži ih usklađenim */
function syncDisplayName(me: MeResponse | null): void {
  if (me?.displayName) useOnlineStore.getState().setDisplayName(me.displayName);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      me: null,

      loadMe: async () => {
        if (!currentUserId()) {
          set({ me: null });
          return;
        }
        try {
          const me = await api.me();
          set({ me });
          if (me.registered) syncDisplayName(me); // ime možda promenjeno na drugom uređaju
        } catch {
          /* best-effort — keš ostaje do sledećeg uspeha */
        }
      },

      register: async (email, password, displayName) => {
        const acc = await api.register({ email, password, displayName });
        const me: MeResponse = { userId: acc.userId, registered: true, email: acc.email, displayName: acc.displayName };
        set({ me });
        syncDisplayName(me);
      },

      login: async (email, password) => {
        const acc = await api.login({ email, password });
        setIdentity({ userId: acc.userId, token: acc.token });
        const me: MeResponse = { userId: acc.userId, registered: true, email: acc.email, displayName: acc.displayName };
        set({ me });
        syncDisplayName(me);
      },

      updateProfile: async (patch) => {
        const me = await api.updateProfile(patch);
        set({ me });
        syncDisplayName(me);
      },

      logout: () => {
        clearIdentity();
        set({ me: null });
      },
    }),
    {
      name: 'prefa-account-v1',
      partialize: (s) => ({ me: s.me }),
    },
  ),
);
