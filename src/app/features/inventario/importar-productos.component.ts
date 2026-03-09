import { Component, Output, EventEmitter, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DecimalPipe } from '@angular/common';
import { CatalogoService } from '../../core/services/catalogo.service';
import { CatalogoFiltrosService } from '../../core/services/catalogo-filtros.service';
import { AuthService } from '../../core/services/auth.service';
import type { Categoria, EstadoProducto } from '../../core/models/producto.model';

export interface FilaImport {
  nombre: string;
  descripcion?: string;
  proveedor?: string;
  precio_base: number;
  precio_sugerido?: number;
  categoria_id?: string;
  categoriaTexto: string;
  categoriaMatch: boolean;
  imagenes: string[];
  seleccionada: boolean;
}

@Component({
  selector: 'app-importar-productos',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './importar-productos.component.html',
})
export class ImportarProductosComponent {
  @Output() cerrar = new EventEmitter<number>(); // emite cuántos se crearon

  private readonly catalogoService = inject(CatalogoService);
  private readonly filtros = inject(CatalogoFiltrosService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly paso = signal<'upload' | 'preview' | 'resultado'>('upload');
  readonly filas = signal<FilaImport[]>([]);
  readonly procesando = signal(false);
  readonly progreso = signal(0);
  readonly resultado = signal<{ exitosos: number; errores: number } | null>(null);
  readonly error = signal<string | null>(null);
  readonly archivoNombre = signal('');

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
    this.parsearExcel(file);
    (event.target as HTMLInputElement).value = '';
  }

  private async parsearExcel(file: File) {
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];

      if (rows.length === 0) {
        this.error.set('El archivo no tiene datos.');
        return;
      }

      const categorias = this.filtros.categorias();

      const filas: FilaImport[] = [];
      for (const row of rows) {
        const nombre = String(row['Title'] ?? '').trim();
        if (!nombre) continue;

        const precio_base = Number(row['Pricing 1']) || 0;
        if (precio_base <= 0) continue;

        const categoriaTexto = String(row['Category'] ?? '').trim();
        const cat = categorias.find(c =>
          c.nombre.toLowerCase() === categoriaTexto.toLowerCase() ||
          c.slug.toLowerCase() === categoriaTexto.toLowerCase()
        );

        const imagenes: string[] = [];
        for (const col of ['Picture', 'Picture 2', 'Picture 3', 'Picture 4']) {
          const url = String(row[col] ?? '').trim();
          if (url && url.startsWith('http')) imagenes.push(url);
        }

        const precio2 = Number(row['Pricing 2']) || undefined;

        filas.push({
          nombre,
          descripcion: String(row['Description'] ?? '').trim() || undefined,
          proveedor: String(row['Brand'] ?? '').trim() || undefined,
          precio_base,
          precio_sugerido: precio2 && precio2 > 0 ? precio2 : undefined,
          categoria_id: cat?.id,
          categoriaTexto,
          categoriaMatch: !!cat,
          imagenes,
          seleccionada: true,
        });
      }

      if (filas.length === 0) {
        this.error.set('No se encontraron filas válidas (necesitan Title y Pricing 1).');
        return;
      }

      this.filas.set(filas);
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
    const esAdmin = this.auth.esAdmin();
    const userId = this.auth.usuario()?.id;
    const estado: EstadoProducto = esAdmin ? 'aprobado' : 'pendiente';

    const payload = seleccionadas.map(f => ({
      nombre: f.nombre,
      descripcion: f.descripcion ?? null,
      proveedor: f.proveedor ?? null,
      precio_base: f.precio_base,
      precio_sugerido: f.precio_sugerido ?? null,
      precio_final: null,
      categoria_id: f.categoria_id ?? null,
      imagenes: f.imagenes,
      disponible: false,
      ganador: false,
      exclusivo: false,
      estado,
      bodega_id: userId ?? null,
      vistas: 0,
      descargas: 0,
    }));

    // Insertar en chunks de 50
    const CHUNK = 50;
    let exitosos = 0;
    let errores = 0;

    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK);
      try {
        await this.catalogoService.insertarProductosBatch(chunk);
        exitosos += chunk.length;
      } catch {
        errores += chunk.length;
      }
      this.progreso.set(Math.round(((i + chunk.length) / payload.length) * 100));
    }

    this.resultado.set({ exitosos, errores });
    this.paso.set('resultado');
    this.procesando.set(false);
  }

  volver() {
    this.paso.set('upload');
    this.filas.set([]);
    this.error.set(null);
    this.archivoNombre.set('');
  }

  finalizar() {
    this.cerrar.emit(this.resultado()?.exitosos ?? 0);
  }
}
