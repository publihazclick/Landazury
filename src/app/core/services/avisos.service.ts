import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface Aviso {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: 'info' | 'promo' | 'alerta' | 'novedad';
  activo: boolean;
  creado_en: string;
}

@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);

  readonly avisos   = signal<Aviso[]>([]);
  readonly leidos   = signal<Set<string>>(new Set());
  readonly cargando = signal(false);

  readonly noLeidos = computed(() => {
    const l = this.leidos();
    return this.avisos().filter(a => !l.has(a.id)).length;
  });

  async cargar() {
    if (!this.auth.estaAutenticado()) return;
    this.cargando.set(true);
    try {
      const uid = this.auth.usuario()!.id;
      const [{ data: av }, { data: vt }] = await Promise.all([
        this.supabase.cliente.from('avisos').select('*').eq('activo', true).order('creado_en', { ascending: false }),
        this.supabase.cliente.from('avisos_vistos').select('aviso_id').eq('usuario_id', uid),
      ]);
      this.avisos.set((av ?? []) as Aviso[]);
      this.leidos.set(new Set((vt ?? []).map((v: any) => v.aviso_id)));
    } catch { /* silencioso */ }
    finally { this.cargando.set(false); }
  }

  async marcarLeido(avisoId: string) {
    const uid = this.auth.usuario()?.id;
    if (!uid || this.leidos().has(avisoId)) return;
    this.leidos.update(s => { const n = new Set(s); n.add(avisoId); return n; });
    await this.supabase.cliente.from('avisos_vistos')
      .upsert({ aviso_id: avisoId, usuario_id: uid }, { onConflict: 'aviso_id,usuario_id' });
  }

  async marcarTodosLeidos() {
    const uid = this.auth.usuario()?.id;
    if (!uid) return;
    const pendientes = this.avisos().filter(a => !this.leidos().has(a.id));
    if (pendientes.length === 0) return;
    this.leidos.update(s => {
      const n = new Set(s);
      pendientes.forEach(a => n.add(a.id));
      return n;
    });
    await this.supabase.cliente.from('avisos_vistos')
      .upsert(pendientes.map(a => ({ aviso_id: a.id, usuario_id: uid })), { onConflict: 'aviso_id,usuario_id' });
  }

  async crearAviso(titulo: string, mensaje: string, tipo: Aviso['tipo']): Promise<Aviso> {
    const { data, error } = await this.supabase.cliente
      .from('avisos').insert({ titulo, mensaje, tipo }).select().single();
    if (error) throw error;
    const aviso = data as Aviso;
    this.avisos.update(list => [aviso, ...list]);
    return aviso;
  }

  async eliminarAviso(id: string) {
    const { error } = await this.supabase.cliente
      .from('avisos').update({ activo: false }).eq('id', id);
    if (error) throw error;
    this.avisos.update(list => list.filter(a => a.id !== id));
  }

  suscribirRealtime() {
    return this.supabase.cliente
      .channel('avisos-canal')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, (payload) => {
        const nuevo = payload.new as Aviso;
        if (nuevo.activo) this.avisos.update(list => [nuevo, ...list]);
      })
      .subscribe();
  }
}
