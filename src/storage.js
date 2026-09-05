// Reemplazo local de la API window.storage que solo existe dentro de los
// artefactos de Claude. Aquí usamos localStorage del navegador: los datos
// quedan guardados en ESTE navegador/computadora únicamente (no se
// sincronizan entre dispositivos). Si más adelante agregas cuentas de
// usuario con un backend (Supabase/Firebase), este archivo es el único
// que tendrías que reemplazar — el resto de la app no cambia.

export const storage = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      return { key, value: raw };
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { key, value };
    } catch {
      return null;
    }
  },
};
