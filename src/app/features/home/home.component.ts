import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import type { Producto } from '../../core/models/producto.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly catalogoService = inject(CatalogoService);

  readonly cargando = signal(false);
  readonly exclusivos = signal<Producto[]>([]);
  readonly ganadores = signal<Producto[]>([]);

  async ngOnInit() {
    const [excl, gan] = await Promise.allSettled([
      this.catalogoService.obtenerExclusivos(),
      this.catalogoService.obtenerGanadores(),
    ]);
    if (excl.status === 'fulfilled') this.exclusivos.set(excl.value);
    if (gan.status === 'fulfilled')  this.ganadores.set(gan.value);
  }

  readonly fallbackExclusivos: Producto[] = [
    { id: 'fb-e1', nombre: 'Masajeador Facial Microcorriente', descripcion: 'Dispositivo de microcorriente para reafirmar la piel.', precio_base: 14, precio_sugerido: 59.99, imagenes: ['https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=400'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Belleza', slug: 'belleza-salud' } },
    { id: 'fb-e2', nombre: 'Purificador de Aire USB Mini', descripcion: 'Purificador con filtro HEPA y difusor de aromas.', precio_base: 9.50, precio_sugerido: 34.99, imagenes: ['https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400'], disponible: true, ganador: false, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Hogar', slug: 'hogar-cocina' } },
    { id: 'fb-e3', nombre: 'Gafas de Sol Aviador Gold', descripcion: 'Lentes aviador con montura dorada y cristal polarizado UV400.', precio_base: 7, precio_sugerido: 39.99, imagenes: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=400'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Moda', slug: 'moda-ropa' } },
    { id: 'fb-e4', nombre: 'Set Skincare Vitamina C', descripcion: 'Kit 4 pasos: limpiador, tónico, sérum y crema.', precio_base: 19, precio_sugerido: 74.99, imagenes: ['https://images.unsplash.com/photo-1601049676869-702ea24cfd58?w=400'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Belleza', slug: 'belleza-salud' } },
  ];

  readonly fallbackGanadores: Producto[] = [
    { id: 'fb-g1', nombre: 'Auriculares Bluetooth Pro X', descripcion: 'ANC, 30h batería, audio Hi-Fi.', precio_base: 18.50, precio_sugerido: 49.99, imagenes: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Electrónica', slug: 'electronica' } },
    { id: 'fb-g2', nombre: 'Smartwatch Fit Pro', descripcion: 'GPS, monitor cardíaco, AMOLED.', precio_base: 22, precio_sugerido: 64.99, imagenes: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Electrónica', slug: 'electronica' } },
    { id: 'fb-g3', nombre: 'Masajeador Facial Microcorriente', descripcion: 'Microcorriente para tonificar y reafirmar.', precio_base: 14, precio_sugerido: 59.99, imagenes: ['https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=400'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Belleza', slug: 'belleza-salud' } },
    { id: 'fb-g4', nombre: 'Cámara Acción 4K Waterproof', descripcion: '4K 60fps, EIS, resistente 30m.', precio_base: 32, precio_sugerido: 99.99, imagenes: ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Electrónica', slug: 'electronica' } },
  ];

  get exclusivosVisibles() { return this.exclusivos().length ? this.exclusivos() : this.fallbackExclusivos; }
  get ganadoresVisibles()  { return this.ganadores().length  ? this.ganadores()  : this.fallbackGanadores; }
  readonly error = signal<string | null>(null);
  readonly registroExitoso = signal(false);
  readonly mostrarContrasena = signal(false);
  readonly emailExiste = signal(false);

  private errorTimeout?: ReturnType<typeof setTimeout>;

  readonly form = this.fb.group({
    nombre:     ['', [Validators.required, Validators.minLength(2)]],
    email:      ['', [Validators.required, Validators.email]],
    pais:       ['', Validators.required],
    telefono:   ['', Validators.required],
    plataforma: ['', Validators.required],
    contrasena: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly paises = [
    'México', 'Colombia', 'Argentina', 'Chile', 'Perú', 'Venezuela',
    'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Guatemala', 'Honduras',
    'El Salvador', 'Nicaragua', 'Costa Rica', 'Panamá', 'Cuba', 'República Dominicana',
  ];

  get fuerzaContrasena(): { nivel: number; label: string; color: string } {
    const v = this.form.get('contrasena')?.value ?? '';
    let nivel = 0;
    if (v.length >= 6) nivel++;
    if (v.length >= 10) nivel++;
    if (/[A-Z]/.test(v) && /[0-9]/.test(v)) nivel++;
    if (/[^A-Za-z0-9]/.test(v)) nivel++;
    const configs = [
      { label: '', color: '' },
      { label: 'Débil', color: 'bg-red-500' },
      { label: 'Regular', color: 'bg-amber-400' },
      { label: 'Buena', color: 'bg-emerald-400' },
      { label: 'Fuerte', color: 'bg-emerald-500' },
    ];
    return { nivel, ...configs[nivel] };
  }

  cerrarError() {
    this.error.set(null);
    clearTimeout(this.errorTimeout);
  }

  private mostrarError(msg: string) {
    this.error.set(msg);
    clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => this.error.set(null), 7000);
  }

  async onSubmit() {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.cargando()) return;

    this.cargando.set(true);
    this.error.set(null);
    this.emailExiste.set(false);
    const { nombre, email, pais, telefono, plataforma, contrasena } = this.form.value;

    try {
      const data = await this.auth.registrar(email!, contrasena!, nombre!, {
        pais: pais ?? undefined,
        telefono: telefono ?? undefined,
        plataforma: plataforma ?? undefined,
      });

      if (data.session) {
        await this.router.navigate(['/catalogo']);
      } else {
        this.registroExitoso.set(true);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        this.emailExiste.set(true);
      } else {
        this.mostrarError(this.traducirError(msg));
      }
    } finally {
      this.cargando.set(false);
    }
  }

  private traducirError(mensaje: string): string {
    if (mensaje.includes('Password should be at least'))
      return 'La contraseña debe tener al menos 6 caracteres.';
    if (mensaje.includes('Too many requests') || mensaje.includes('rate limit') || mensaje.includes('over_email_send_rate_limit'))
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    if (mensaje.includes('Failed to fetch') || mensaje.includes('network') || mensaje.includes('NetworkError'))
      return 'Sin conexión a internet. Verifica tu red e intenta de nuevo.';
    if (mensaje.includes('invalid email') || mensaje.includes('Unable to validate'))
      return 'El formato del correo electrónico no es válido.';
    return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  }

  scrollCarrusel(dir: 1 | -1) {
    const el = document.getElementById('carrusel');
    if (!el) return;
    const card = el.firstElementChild as HTMLElement;
    const ancho = card ? card.offsetWidth + 16 : 300;
    el.scrollBy({ left: dir * ancho, behavior: 'smooth' });
  }

  margenProducto(p: Producto): number {
    if (!p.precio_sugerido || p.precio_base === 0) return 0;
    return Math.round(((p.precio_sugerido - p.precio_base) / p.precio_base) * 100);
  }
}
