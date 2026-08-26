import { Component, inject, signal, OnInit, computed, PLATFORM_ID } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import { SeoService } from '../../core/services/seo.service';
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
  private readonly seo = inject(SeoService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);

  readonly cargando = signal(false);
  readonly exclusivos = signal<Producto[]>([]);
  readonly ganadores = signal<Producto[]>([]);

  // Video hero de YouTube (short)
  private readonly VIDEO_ID = 'SLqK2QUKAXc';
  readonly videoMuteado = signal(true);
  readonly videoUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    `https://www.youtube-nocookie.com/embed/${this.VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${this.VIDEO_ID}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&showinfo=0&disablekb=1&fs=0&iv_load_policy=3`,
  );

  toggleVideoSound() {
    if (!isPlatformBrowser(this.platformId)) return;
    const iframe = document.getElementById('hero-video') as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    const muteado = this.videoMuteado();
    const msg = muteado
      ? '{"event":"command","func":"unMute","args":""}'
      : '{"event":"command","func":"mute","args":""}';
    iframe.contentWindow.postMessage(msg, '*');
    this.videoMuteado.set(!muteado);
  }
  readonly indicativosPais: Record<string, string> = {
    'México': '+52', 'Colombia': '+57', 'Argentina': '+54',
    'Chile': '+56', 'Perú': '+51', 'Venezuela': '+58',
    'Ecuador': '+593', 'Bolivia': '+591', 'Paraguay': '+595',
    'Uruguay': '+598', 'Guatemala': '+502', 'Honduras': '+504',
    'El Salvador': '+503', 'Nicaragua': '+505', 'Costa Rica': '+506',
    'Panamá': '+507', 'Cuba': '+53', 'República Dominicana': '+1',
  };

  get indicativoActual(): string {
    return this.indicativosPais[this.form.get('pais')?.value ?? ''] ?? '';
  }

  async ngOnInit() {
    this.seo.setPage({
      title: 'Dropshipping Elite para LATAM',
      description:
        'Accede al catálogo de productos exclusivos con alto margen para dropshipping en Latinoamérica. Mentoría experta, tendencias en tiempo real y máxima rentabilidad.',
      canonical: '/',
    });
    const [excl, gan] = await Promise.allSettled([
      this.catalogoService.obtenerExclusivos(),
      this.catalogoService.obtenerGanadores(),
    ]);
    if (excl.status === 'fulfilled') this.exclusivos.set(excl.value);
    if (gan.status === 'fulfilled')  this.ganadores.set(gan.value);
  }

  readonly fallbackExclusivos: Producto[] = [
    { id: 'fb-e1', nombre: 'REF: 13 ADIDAS SUELA EVA', descripcion: 'Tenis deportivos ultra livianos con suela EVA resistente y cómoda.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776111061274_d081236d.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e2', nombre: 'Funda Computador Portátil', descripcion: 'Funda de neopreno con protección ligera contra golpes y arañazos.', precio_base: 12000, precio_sugerido: 38400, precio_final: 18000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774553625361.jpg'], disponible: true, ganador: false, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Accesorios', slug: 'accesorios' } },
    { id: 'fb-e3', nombre: 'REF: 12 NIKE SUELA EVA', descripcion: 'Diseño deportivo premium, suela ultra liviana, múltiples colores.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776110567639_709f5443.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e4', nombre: 'Cargador Apple 20W', descripcion: 'Cargador cubo 20W con tecnología de carga rápida, compatible con iPhone.', precio_base: 28000, precio_sugerido: 89600, precio_final: 42000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774553816116.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Electrónica', slug: 'electronica' } },
    { id: 'fb-e5', nombre: 'REF: 11 MARCA BLANCA', descripcion: 'Tenis deportivos versátiles, disponibles en varios colores y tallas.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776110087107_5fd370f0.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e6', nombre: 'Control PS2 Negro', descripcion: 'Control alámbrico con DualShock 2, precisión y respuesta profesional.', precio_base: 42000, precio_sugerido: 134400, precio_final: 63000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774553898005.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
    { id: 'fb-e7', nombre: 'REF: 10 ADIDAS', descripcion: 'Zapato deportivo clásico con suela reforzada, estilo urbano moderno.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776109648064_1ce32cd7.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e8', nombre: 'Manos Libres THE-710', descripcion: 'Auricular manos libres con entrada 3.5 mm, comodidad y alta fidelidad.', precio_base: 35000, precio_sugerido: 112000, precio_final: 52500, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774553951404.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Audio', slug: 'audio' } },
    { id: 'fb-e9', nombre: 'REF: 09 ADIDAS', descripcion: 'Tenis con diseño urbano deportivo y excelente amortiguación.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776107560283_2bb844ae.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e10', nombre: 'Cuellera S-6', descripcion: 'Cuellera bluetooth con batería 2500 mAh, sonido Hi-Fi envolvente.', precio_base: 18000, precio_sugerido: 57600, precio_final: 27000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774554120724.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Audio', slug: 'audio' } },
    { id: 'fb-e11', nombre: 'REF: 08 TIMBERLAND', descripcion: 'Estilo urbano resistente, ideal para uso diario y deportivo.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776106894927_7a48d66e.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e12', nombre: 'Mouse CM-189 Ergonómico', descripcion: 'Mouse óptico ergonómico, ideal para largas jornadas de oficina.', precio_base: 12000, precio_sugerido: 38400, precio_final: 18000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774554793883.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Computación', slug: 'computacion' } },
    { id: 'fb-e13', nombre: 'REF: 07 ADIDAS', descripcion: 'Tenis urbanos con acabados premium y suela antideslizante.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776105876400_38ca7937.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e14', nombre: 'Cargador Apple 35W', descripcion: 'Cargador de 35W tipo C a C, ideal para iPhone 15 y MacBook.', precio_base: 28000, precio_sugerido: 89600, precio_final: 42000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774553473574.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Electrónica', slug: 'electronica' } },
    { id: 'fb-e15', nombre: 'REF: 06 BRAHMA', descripcion: 'Calzado urbano con suela EVA ultra liviana y cómoda.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776105270413_d4bcc28a.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e16', nombre: 'Cooler Gaming F1', descripcion: 'Base refrigerante para laptop con 5 ventiladores LED RGB.', precio_base: 18000, precio_sugerido: 57600, precio_final: 27000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774553856426.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
    { id: 'fb-e17', nombre: 'REF: 05 BRAHMA', descripcion: 'Calzado deportivo con excelente agarre y gran confort diario.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776104880519_aacf3129.jpeg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e18', nombre: 'Onikuma K8 Gaming', descripcion: 'Diadema gamer profesional con drivers de 50 mm y micrófono HD.', precio_base: 18000, precio_sugerido: 57600, precio_final: 27000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774554016178.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
    { id: 'fb-e19', nombre: 'REF: 04 CATERPILLAR', descripcion: 'Bota de trabajo premium con máxima durabilidad y comodidad.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776100496784.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-e20', nombre: 'Silicona JoyCon Mario', descripcion: 'Protector de silicona para Nintendo Switch JoyCon, diseño Mario.', precio_base: 15000, precio_sugerido: 48000, precio_final: 22500, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774555600054.jpg'], disponible: true, ganador: true, exclusivo: true, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
  ];

  readonly fallbackGanadores: Producto[] = [
    { id: 'fb-g1', nombre: 'REF: 07 ADIDAS', descripcion: 'Tenis urbanos con acabados premium y suela antideslizante.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776105876400_38ca7937.jpeg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-g2', nombre: 'Receptor de Música X6', descripcion: 'Adaptador receptor inalámbrico que transforma cualquier equipo.', precio_base: 42000, precio_sugerido: 134400, precio_final: 63000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774555338666.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Audio', slug: 'audio' } },
    { id: 'fb-g3', nombre: 'REF: 06 BRAHMA', descripcion: 'Calzado urbano con suela EVA ultra liviana y cómoda.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776105270413_d4bcc28a.jpeg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-g4', nombre: 'Onikuma X22 Gaming', descripcion: 'Diadema gamer con driver de 50 mm, sonido envolvente y luces RGB.', precio_base: 35000, precio_sugerido: 112000, precio_final: 52500, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774554676179.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
    { id: 'fb-g5', nombre: 'REF: 05 BRAHMA', descripcion: 'Calzado deportivo con excelente agarre y confort diario.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776104880519_aacf3129.jpeg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-g6', nombre: 'Dock Switch 2 Multifuncional', descripcion: 'Soporte multifuncional para Nintendo Switch 2, optimiza tu gaming.', precio_base: 22000, precio_sugerido: 70400, precio_final: 33000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774556002214.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
    { id: 'fb-g7', nombre: 'REF: 04 CATERPILLAR', descripcion: 'Bota de trabajo premium con máxima durabilidad y comodidad.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776100496784.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-g8', nombre: 'Vidrio Switch 2', descripcion: 'Protector de vidrio templado para Nintendo Switch 2, 9H de dureza.', precio_base: 42000, precio_sugerido: 134400, precio_final: 63000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774555952289.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Gaming', slug: 'gaming' } },
    { id: 'fb-g9', nombre: 'REF: 03 TIMBERLAND', descripcion: 'Zapato deportivo premium con diseño urbano y suela reforzada.', precio_base: 52000, precio_sugerido: 120000, precio_final: 67000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/0f6767f0-04b4-4852-aa5d-5f6184e6580d/1776098047632.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Calzado', slug: 'calzado' } },
    { id: 'fb-g10', nombre: 'Manos Libre P-16', descripcion: 'Auriculares manos libres con conexión fácil y sonido limpio.', precio_base: 18000, precio_sugerido: 57600, precio_final: 27000, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774555570003.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Audio', slug: 'audio' } },
    { id: 'fb-g11', nombre: 'Cable Goma Carga Rápida', descripcion: 'Cable de carga rápida USB Tipo C con revestimiento antidesgaste.', precio_base: 15000, precio_sugerido: 48000, precio_final: 22500, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774554275665.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Cables', slug: 'cables' } },
    { id: 'fb-g12', nombre: 'Cuellera AKZ-R5', descripcion: 'Cuellera bluetooth con conexión fácil, libertad y gran autonomía.', precio_base: 35000, precio_sugerido: 112000, precio_final: 52500, imagenes: ['https://tisrfefpjordcpuzyiwr.supabase.co/storage/v1/object/public/imagenes-productos/productos/c53c8f67-67ca-4ab8-a385-d4a0a5d9a716/1774555535610.jpg'], disponible: true, ganador: true, exclusivo: false, estado: 'aprobado' as const, vistas: 0, descargas: 0, creado_en: '', categoria: { id: '', nombre: 'Audio', slug: 'audio' } },
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

    const whatsapp = telefono
      ? (this.indicativoActual ? `${this.indicativoActual} ${telefono}` : telefono)
      : undefined;

    try {
      const data = await this.auth.registrar(email!, contrasena!, nombre!, {
        pais: pais ?? undefined,
        telefono: whatsapp,
        plataforma: plataforma ?? undefined,
      });

      // Si el signUp no devolvió sesión (raro con autoconfirm activo), forzar login.
      if (!data.session) {
        try { await this.auth.iniciarSesion(email!, contrasena!); } catch { /* silencioso */ }
      }
      await this.router.navigate(['/catalogo']);
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
