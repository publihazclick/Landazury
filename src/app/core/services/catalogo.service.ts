import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { Producto, Categoria, Favorito } from '../models/producto.model';

@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  private normalizar(data: any[]): Producto[] {
    return data.map(p => ({
      ganador: false, exclusivo: false,
      estado: 'aprobado', vistas: 0, descargas: 0,
      ...p,
    }));
  }

  // Usuarios: solo productos aprobados y disponibles
  async obtenerProductos(filtros?: { categoriaId?: string; busqueda?: string }) {
    let query = this.supabase.cliente
      .from('productos')
      .select('*, categoria:categorias(*), creativos(*)')
      .eq('disponible', true)
      .eq('estado', 'aprobado')
      .order('creado_en', { ascending: false });

    if (filtros?.categoriaId) query = query.eq('categoria_id', filtros.categoriaId);
    if (filtros?.busqueda) query = query.ilike('nombre', `%${filtros.busqueda}%`);

    const { data, error } = await query;
    if (error) throw error;
    return this.normalizar(data);
  }

  // Admin/inventario: todos los productos; filtro opcional por bodega
  async obtenerTodosProductos(filtros?: { categoriaId?: string; busqueda?: string; bodegaId?: string; estado?: string }) {
    let query = this.supabase.cliente
      .from('productos')
      .select('*, categoria:categorias(*), creativos(*)')
      .order('creado_en', { ascending: false });

    if (filtros?.categoriaId) query = query.eq('categoria_id', filtros.categoriaId);
    if (filtros?.busqueda) query = query.ilike('nombre', `%${filtros.busqueda}%`);
    if (filtros?.bodegaId) query = query.eq('bodega_id', filtros.bodegaId);
    if (filtros?.estado) query = query.eq('estado', filtros.estado);

    const { data, error } = await query;
    if (error) throw error;
    return this.normalizar(data);
  }

  async obtenerProducto(id: string) {
    const { data, error } = await this.supabase.cliente
      .from('productos')
      .select('*, categoria:categorias(*), creativos(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return this.normalizar([data])[0];
  }

  async crearProducto(producto: Omit<Producto, 'id' | 'creado_en' | 'categoria' | 'creativos'>) {
    const { data, error } = await this.supabase.cliente
      .from('productos')
      .insert(producto)
      .select()
      .single();
    if (error) throw error;
    return data as Producto;
  }

  async actualizarProducto(id: string, cambios: Partial<Omit<Producto, 'id' | 'creado_en' | 'categoria' | 'creativos'>>) {
    const { error } = await this.supabase.cliente.from('productos').update(cambios).eq('id', id);
    if (error) throw error;
  }

  async eliminarProducto(id: string) {
    const { error } = await this.supabase.cliente.from('productos').delete().eq('id', id);
    if (error) throw error;
  }

  // ── Flujo de aprobación ─────────────────────────────────────────────────────

  async aprobarProducto(id: string, precios?: { precio_base?: number; precio_final?: number }) {
    const cambios: any = { estado: 'aprobado', disponible: true };
    if (precios?.precio_base) cambios.precio_base = precios.precio_base;
    if (precios?.precio_final) cambios.precio_final = precios.precio_final;
    const { error } = await this.supabase.cliente.from('productos').update(cambios).eq('id', id);
    if (error) throw error;
  }

  async rechazarProducto(id: string) {
    const { error } = await this.supabase.cliente
      .from('productos')
      .update({ estado: 'rechazado', disponible: false })
      .eq('id', id);
    if (error) throw error;
  }

  // ── Estadísticas / tracking ─────────────────────────────────────────────────

  async registrarVista(productoId: string) {
    await this.supabase.cliente.rpc('incrementar_vistas', { producto_uuid: productoId });
  }

  async registrarDescarga(productoId: string) {
    await this.supabase.cliente.rpc('incrementar_descargas', { producto_uuid: productoId });
  }

  async obtenerTopProductos(tipo: 'vistas' | 'descargas', limit = 5): Promise<Producto[]> {
    const { data, error } = await this.supabase.cliente
      .from('productos')
      .select('*, categoria:categorias(*)')
      .eq('estado', 'aprobado')
      .order(tipo, { ascending: false })
      .limit(limit);
    if (error) return [];
    return this.normalizar(data);
  }

  async obtenerTopFavoritos(limit = 5): Promise<{ producto_id: string; total: number; producto?: Producto }[]> {
    const { data, error } = await this.supabase.cliente
      .from('favoritos')
      .select('producto_id')
      .order('producto_id');
    if (error) return [];
    // Contar por producto_id
    const conteo: Record<string, number> = {};
    for (const f of data) {
      conteo[f.producto_id] = (conteo[f.producto_id] ?? 0) + 1;
    }
    return Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([producto_id, total]) => ({ producto_id, total }));
  }

  // ── Categorías ──────────────────────────────────────────────────────────────

  async obtenerCategorias() {
    const { data, error } = await this.supabase.cliente
      .from('categorias')
      .select('*')
      .order('nombre');
    if (error) throw error;
    return data as Categoria[];
  }

  async obtenerGanadores() {
    const { data, error } = await this.supabase.cliente
      .from('productos')
      .select('*, categoria:categorias(*)')
      .eq('ganador', true)
      .eq('disponible', true)
      .eq('estado', 'aprobado')
      .order('creado_en', { ascending: false })
      .limit(4);
    if (error) return [];
    return this.normalizar(data);
  }

  async obtenerExclusivos() {
    const { data, error } = await this.supabase.cliente
      .from('productos')
      .select('*, categoria:categorias(*)')
      .eq('exclusivo', true)
      .eq('disponible', true)
      .eq('estado', 'aprobado')
      .order('creado_en', { ascending: false })
      .limit(12);
    if (error) return [];
    return this.normalizar(data);
  }

  async toggleGanador(id: string, valor: boolean) {
    const { error } = await this.supabase.cliente.from('productos').update({ ganador: valor }).eq('id', id);
    if (error) throw error;
  }

  async toggleExclusivo(id: string, valor: boolean) {
    const { error } = await this.supabase.cliente.from('productos').update({ exclusivo: valor }).eq('id', id);
    if (error) throw error;
  }

  // ── Favoritos ───────────────────────────────────────────────────────────────

  async obtenerFavoritos() {
    const usuario = this.auth.usuario();
    if (!usuario) return [];

    const { data, error } = await this.supabase.cliente
      .from('favoritos')
      .select('*, producto:productos(*)')
      .eq('usuario_id', usuario.id);
    if (error) throw error;
    return data as Favorito[];
  }

  async toggleFavorito(productoId: string) {
    const usuario = this.auth.usuario();
    if (!usuario) throw new Error('Debes iniciar sesión');

    const { data: existente } = await this.supabase.cliente
      .from('favoritos')
      .select('id')
      .eq('usuario_id', usuario.id)
      .eq('producto_id', productoId)
      .single();

    if (existente) {
      const { error } = await this.supabase.cliente
        .from('favoritos')
        .delete()
        .eq('id', existente.id);
      if (error) throw error;
      return false;
    } else {
      const { error } = await this.supabase.cliente
        .from('favoritos')
        .insert({ usuario_id: usuario.id, producto_id: productoId });
      if (error) throw error;
      return true;
    }
  }
}
