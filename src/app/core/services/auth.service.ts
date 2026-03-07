import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import type { Perfil, Rol } from '../models/usuario.model';
import type { Session, User } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly sesion = signal<Session | null>(null);
  readonly usuario = computed<User | null>(() => this.sesion()?.user ?? null);
  readonly perfil = signal<Perfil | null>(null);
  readonly estaAutenticado = computed(() => !!this.sesion());
  readonly cargando = signal(true);

  readonly rol = computed<Rol | null>(() => this.perfil()?.rol ?? null);
  readonly esAdmin = computed(() => this.perfil()?.rol === 'admin');
  readonly esInventario = computed(() => this.perfil()?.rol === 'inventario');

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.inicializar();
    } else {
      this.cargando.set(false);
    }
  }

  private async inicializar() {
    const { data } = await this.supabase.cliente.auth.getSession();
    this.sesion.set(data.session);
    if (data.session) await this.cargarPerfil(data.session.user.id);
    this.cargando.set(false);

    this.supabase.cliente.auth.onAuthStateChange(async (_, sesion) => {
      this.sesion.set(sesion);
      if (sesion) {
        await this.cargarPerfil(sesion.user.id);
      } else {
        this.perfil.set(null);
      }
    });
  }

  private async cargarPerfil(userId: string) {
    const { data } = await this.supabase.cliente
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) this.perfil.set(data as Perfil);
  }

  async iniciarSesion(email: string, contrasena: string) {
    const { data, error } = await this.supabase.cliente.auth.signInWithPassword({
      email,
      password: contrasena,
    });
    if (error) throw error;
    // Asegurar que el perfil esté cargado antes de retornar
    if (data.session) await this.cargarPerfil(data.session.user.id);
    return data;
  }

  async registrar(
    email: string,
    contrasena: string,
    nombre: string,
    extra?: { pais?: string; telefono?: string; plataforma?: string }
  ) {
    const { data, error } = await this.supabase.cliente.auth.signUp({
      email,
      password: contrasena,
      options: { data: { nombre, ...extra } },
    });
    if (error) throw error;

    // Si hay sesión inmediata (auto-confirm), guardar campos extra en el perfil
    if (data.session && data.user && extra) {
      const patch: Record<string, string> = {};
      if (extra.pais)       patch['pais']       = extra.pais;
      if (extra.telefono)   patch['telefono']   = extra.telefono;
      if (extra.plataforma) patch['plataforma'] = extra.plataforma;
      if (Object.keys(patch).length > 0) {
        await this.supabase.cliente.from('perfiles').update(patch).eq('id', data.user.id);
      }
    }

    return data;
  }

  readonly cerrandoSesion = signal(false);

  async cerrarSesion() {
    if (this.cerrandoSesion()) return;
    this.cerrandoSesion.set(true);
    try {
      await this.supabase.cliente.auth.signOut();
    } catch { /* ignorar errores de red — igual limpiamos estado local */ } finally {
      this.sesion.set(null);
      this.perfil.set(null);
      this.cerrandoSesion.set(false);
      await this.router.navigate(['/auth/login']);
    }
  }

  async recuperarContrasena(email: string) {
    const { error } = await this.supabase.cliente.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/nueva-contrasena`,
    });
    if (error) throw error;
  }
}
