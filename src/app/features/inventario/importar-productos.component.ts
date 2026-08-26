import { Component, Output, EventEmitter, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CatalogoService } from '../../core/services/catalogo.service';
import { CatalogoFiltrosService } from '../../core/services/catalogo-filtros.service';
import { AuthService } from '../../core/services/auth.service';
import { ExcelProductosService } from '../../core/services/excel-productos.service';
import type { FilaImport } from '../../core/services/excel-productos.service';
import type { EstadoProducto, Producto } from '../../core/models/producto.model';

export type { FilaImport };

@Component({
  selector: 'app-importar-productos',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  templateUrl: './importar-productos.component.html',
})
export class ImportarProductosComponent {
  @Output() cerrar = new EventEmitter<Producto[]>();

  private readonly catalogoService  = inject(CatalogoService);
  private readonly filtros          = inject(CatalogoFiltrosService);
  readonly auth                     = inject(AuthService);
  private readonly excelService     = inject(ExcelProductosService);
  private readonly platformId       = inject(PLATFORM_ID);

  readonly paso        = signal<'upload' | 'preview' | 'resultado'>('upload');
  readonly filas       = signal<FilaImport[]>([]);
  readonly procesando  = signal(false);
  readonly progreso    = signal(0);
  readonly resultado   = signal<{ exitosos: number; errores: number; mensajeError?: string } | null>(null);
  readonly error       = signal<string | null>(null);
  readonly archivoNombre = signal('');
  readonly incluirInactivos = signal(false);

  // Stats del parseo
  readonly statsLeidas    = signal(0);
  readonly statsOmitidas  = signal(0);
  readonly statsInactivas = signal(0);

  get filasSeleccionadas(): FilaImport[] {
    return this.filas().filter(f => f.seleccionada);
  }
  get totalConCategoria(): number {
    return this.filasSeleccionadas.filter(f => f.categoriaMatch).length;
  }
  get totalSinCategoria(): number {
    return this.filasSeleccionadas.filter(f => !f.categoriaMatch).length;
  }

  toggleTodas(valor: boolean) {
    this.filas.update(fs => fs.map(f => ({ ...f, seleccionada: valor })));
  }

  toggleFila(idx: number) {
    this.filas.update(fs => fs.map((f, i) => i === idx ? { ...f, seleccionada: !f.seleccionada } : f));
  }

  todasSeleccionadas(): boolean {
    const fs = this.filas();
    return fs.length > 0 && fs.every(f => f.seleccionada);
  }

  onArchivo(event: Event) {
    if (!isPlatformBrowser(this.platformId)) return;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set(null);
    this.archivoNombre.set(file.name);
    this.parsear(file);
    (event.target as HTMLInputElement).value = '';
  }

  private async parsear(file: File) {
    try {
      const categorias = this.filtros.categorias();
      const result = await this.excelService.parsear(file, categorias, this.incluirInactivos());

      if (result.filas.length === 0) {
        this.error.set(
          result.totalLeidas === 0
            ? 'El archivo no tiene datos.'
            : `No se encontraron filas válidas. Omitidas: ${result.omitidas}, Inactivas: ${result.inactivas}.`
        );
        return;
      }

      this.filas.set(result.filas);
      this.statsLeidas.set(result.totalLeidas);
      this.statsOmitidas.set(result.omitidas);
      this.statsInactivas.set(result.inactivas);
      this.paso.set('preview');
    } catch (e: any) {
      this.error.set('Error al leer el archivo: ' + (e?.message ?? 'formato no válido'));
    }
  }

  async importar() {
    const seleccionadas = this.filasSeleccionadas;
    if (seleccionadas.length === 0) return;

    this.procesando.set(true);
    this.progreso.set(0);
    const userId  = this.auth.usuario()?.id;

    // Auto-crear categorías que el Excel mencionó pero no existen aún
    const textosSinMatch = Array.from(new Set(
      seleccionadas
        .filter(f => !f.categoriaMatch && f.categoriaTexto)
        .map(f => f.categoriaTexto.trim()),
    ));
    if (textosSinMatch.length > 0) {
      const nuevas: Record<string, string> = {};
      for (const texto of textosSinMatch) {
        try {
          const cat = await this.catalogoService.crearCategoria(texto);
          nuevas[texto.toLowerCase()] = cat.id;
        } catch { /* ignorar fallos de creación */ }
      }
      // Refrescar lista global y asignar IDs a las filas
      if (Object.keys(nuevas).length > 0) {
        try {
          const data = await this.catalogoService.obtenerCategorias();
          this.filtros.categorias.set(data);
        } catch { /* silencioso */ }
        this.filas.update(fs => fs.map(f => {
          const id = nuevas[f.categoriaTexto.trim().toLowerCase()];
          return id ? { ...f, categoria_id: id, categoriaMatch: true } : f;
        }));
      }
    }

    const filasFinales = this.filasSeleccionadas;

    // Productos importados: solo se publican si tienen imagen Y categoría.
    // Si les falta algo quedan como borrador (disponible=false) hasta que el
    // subidor los complete desde el inventario — así no contaminan el catálogo público.
    // Defaults de dimensiones por slug — si el Excel no trajo las medidas se aplican
    // los mismos valores que el backfill SQL, por categoría.
    const cats = this.filtros.categorias();
    const slugDe = (id: string | null | undefined) =>
      (cats.find(c => c.id === id)?.slug ?? '').toLowerCase();
    const dimDef = (slug: string) => {
      if (slug === 'calzado')    return { alto: 18, ancho: 21, largo: 29, peso: 0.800 };
      if (slug === 'billeteras') return { alto:  5, ancho: 15, largo: 18, peso: 0.200 };
      return { alto: 18, ancho: 29, largo: 30, peso: 1.000 };
    };

    const payload = filasFinales.map(f => {
      const imagenValida = !!f.imagen_url?.trim();
      const tieneCategoria = !!f.categoria_id;
      const publicable = imagenValida && tieneCategoria;
      const def = dimDef(slugDe(f.categoria_id));
      return {
        nombre:          f.nombre,
        descripcion:     f.descripcion ?? null,
        sku:             f.sku ?? null,
        stock:           f.stock ?? null,
        precio_base:     f.precio_base,
        precio_sugerido: f.precio_sugerido ?? null,
        precio_final:    f.precio_base,
        categoria_id:    f.categoria_id ?? null,
        imagenes:        imagenValida ? [f.imagen_url!] : [] as string[],
        link_creativos:  f.link_creativos ?? null,
        alto_cm:         f.alto_cm  ?? def.alto,
        ancho_cm:        f.ancho_cm ?? def.ancho,
        largo_cm:        f.largo_cm ?? def.largo,
        peso_kg:         f.peso_kg  ?? def.peso,
        disponible:      publicable,
        ganador:         false,
        exclusivo:       false,
        estado:          'aprobado' as EstadoProducto,
        bodega_id:       userId ?? null,
        vistas:          0,
        descargas:       0,
      };
    });

    const CHUNK = 50;
    let exitosos = 0;
    let errores  = 0;
    let mensajeError: string | undefined;
    this.productosCreados = [];

    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      try {
        const creados = await this.catalogoService.insertarProductosBatch(chunk);
        this.productosCreados.push(...creados);
        exitosos += creados.length;
      } catch (err: any) {
        errores += chunk.length;
        console.error('[importar-productos] Insert batch falló:', err, { chunkSample: chunk[0] });
        if (!mensajeError) {
          mensajeError = err?.message || err?.error_description || err?.hint || JSON.stringify(err);
        }
      }
      this.progreso.set(Math.round(((i + chunk.length) / payload.length) * 100));
    }

    this.resultado.set({ exitosos, errores, mensajeError });
    this.paso.set('resultado');
    this.procesando.set(false);
  }

  private productosCreados: Producto[] = [];

  async descargarPlantilla() {
    if (!isPlatformBrowser(this.platformId)) return;
    const XLSX = await import('xlsx');
    const categorias = this.filtros.categorias();
    const catNombres = categorias.map(c => c.nombre).join(', ');

    // Fila de ejemplo
    const ejemplo = [{
      'Title': 'Producto ejemplo',
      'Description': 'Descripción del producto',
      'Category': categorias.length > 0 ? categorias[0].nombre : '',
      'SKU': 'SKU-001',
      'Pricing 1': 25000,
      'Pricing 2': 45000,
      'Stock': 100,
      'Active': 1,
      'Image URL': 'https://ejemplo.com/imagen.jpg',
      'Creativos Drive': 'https://drive.google.com/...',
      // Dimensiones del paquete — opcional. Si se dejan vacías se aplican
      // defaults por categoría (calzado / billeteras / resto).
      'Height (cm)': 18,
      'Width (cm)':  29,
      'Length (cm)': 30,
      'Weight (kg)': 1,
    }];

    const ws = XLSX.utils.json_to_sheet(ejemplo);

    // Agregar hoja de categorías disponibles
    const catSheet = XLSX.utils.json_to_sheet(
      categorias.map(c => ({ 'Categoría': c.nombre, 'Slug': c.slug }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.utils.book_append_sheet(wb, catSheet, 'Categorías disponibles');

    XLSX.writeFile(wb, 'plantilla_productos_landazury.xlsx');
  }

  volver() {
    this.paso.set('upload');
    this.filas.set([]);
    this.error.set(null);
    this.archivoNombre.set('');
  }

  finalizar() {
    this.cerrar.emit(this.productosCreados);
    this.productosCreados = [];
  }
}
