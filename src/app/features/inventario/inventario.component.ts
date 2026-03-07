import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { CreativosService } from '../../core/services/creativos.service';
import { CatalogoService } from '../../core/services/catalogo.service';
import type { Creativo, Producto, TipoCreativo } from '../../core/models/producto.model';

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './inventario.component.html',
})
export class InventarioComponent implements OnInit {
  private readonly creativosService = inject(CreativosService);
  private readonly catalogoService = inject(CatalogoService);

  readonly creativos = signal<Creativo[]>([]);
  readonly productos = signal<Producto[]>([]);
  readonly cargando = signal(true);
  readonly subiendo = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  // Filtros
  filtroTipo = '';
  filtroProducto = '';

  // Formulario subida
  archivoSeleccionado: File | null = null;
  nombreArchivo = '';
  descripcionArchivo = '';
  productoAsociado = '';
  publicoArchivo = true;

  // Nuevo producto (modal)
  mostrarModalProducto = false;
  nuevoProducto = { nombre: '', descripcion: '', precio_base: 0, precio_sugerido: 0, proveedor: '', categoria_id: '' };
  guardandoProducto = false;

  readonly tipos: { valor: TipoCreativo | ''; etiqueta: string }[] = [
    { valor: '', etiqueta: 'Todos' },
    { valor: 'imagen', etiqueta: '🖼️ Imágenes' },
    { valor: 'video', etiqueta: '🎬 Videos' },
    { valor: 'pdf', etiqueta: '📄 PDFs' },
    { valor: 'documento', etiqueta: '📝 Documentos' },
    { valor: 'otro', etiqueta: '📦 Otros' },
  ];

  async ngOnInit() {
    await Promise.all([this.cargarCreativos(), this.cargarProductos()]);
  }

  async cargarCreativos() {
    this.cargando.set(true);
    try {
      const data = await this.creativosService.obtenerCreativos({
        tipo: (this.filtroTipo as TipoCreativo) || undefined,
        productoId: this.filtroProducto || undefined,
      });
      this.creativos.set(data);
    } catch {
      this.error.set('No se pudieron cargar los creativos.');
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarProductos() {
    try {
      const data = await this.catalogoService.obtenerTodosProductos();
      this.productos.set(data);
    } catch {
      // silencioso
    }
  }

  onArchivoSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.archivoSeleccionado = file;
    if (!this.nombreArchivo) {
      this.nombreArchivo = file.name.replace(/\.[^.]+$/, '');
    }
  }

  async subirArchivo() {
    if (!this.archivoSeleccionado || !this.nombreArchivo.trim()) {
      this.error.set('Selecciona un archivo y dale un nombre.');
      return;
    }
    this.subiendo.set(true);
    this.error.set(null);
    try {
      await this.creativosService.subirCreativo(this.archivoSeleccionado, {
        nombre: this.nombreArchivo.trim(),
        descripcion: this.descripcionArchivo || undefined,
        productoId: this.productoAsociado || undefined,
        publico: this.publicoArchivo,
      });
      this.exito.set('Archivo subido correctamente.');
      this.limpiarFormulario();
      await this.cargarCreativos();
      setTimeout(() => this.exito.set(null), 3000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al subir el archivo.');
    } finally {
      this.subiendo.set(false);
    }
  }

  async descargar(creativo: Creativo) {
    try {
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = creativo.nombre;
      a.click();
    } catch {
      this.error.set('No se pudo generar el enlace de descarga.');
    }
  }

  async eliminar(creativo: Creativo) {
    if (!confirm(`¿Eliminar "${creativo.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await this.creativosService.eliminarCreativo(creativo.id, creativo.archivo_path);
      this.creativos.update((list) => list.filter((c) => c.id !== creativo.id));
      this.exito.set('Creativo eliminado.');
      setTimeout(() => this.exito.set(null), 3000);
    } catch {
      this.error.set('No se pudo eliminar el creativo.');
    }
  }

  async guardarProducto() {
    if (!this.nuevoProducto.nombre.trim() || !this.nuevoProducto.precio_base) {
      this.error.set('Nombre y precio base son obligatorios.');
      return;
    }
    this.guardandoProducto = true;
    this.error.set(null);
    try {
      await this.catalogoService.crearProducto({
        nombre: this.nuevoProducto.nombre.trim(),
        descripcion: this.nuevoProducto.descripcion || undefined,
        precio_base: Number(this.nuevoProducto.precio_base),
        precio_sugerido: Number(this.nuevoProducto.precio_sugerido) || undefined,
        proveedor: this.nuevoProducto.proveedor || undefined,
        categoria_id: this.nuevoProducto.categoria_id || undefined,
        disponible: true,
        imagenes: [],
      });
      this.exito.set('Producto creado correctamente.');
      this.mostrarModalProducto = false;
      this.nuevoProducto = { nombre: '', descripcion: '', precio_base: 0, precio_sugerido: 0, proveedor: '', categoria_id: '' };
      await this.cargarProductos();
      setTimeout(() => this.exito.set(null), 3000);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al crear el producto.');
    } finally {
      this.guardandoProducto = false;
    }
  }

  async toggleDisponible(producto: Producto) {
    try {
      await this.catalogoService.actualizarProducto(producto.id, { disponible: !producto.disponible });
      this.productos.update((list) =>
        list.map((p) => (p.id === producto.id ? { ...p, disponible: !p.disponible } : p))
      );
    } catch {
      this.error.set('No se pudo actualizar el producto.');
    }
  }

  nombreProducto(id: string): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? '—';
  }

  limpiarFormulario() {
    this.archivoSeleccionado = null;
    this.nombreArchivo = '';
    this.descripcionArchivo = '';
    this.productoAsociado = '';
    this.publicoArchivo = true;
  }

  icono(tipo: TipoCreativo) {
    return this.creativosService.iconoTipo(tipo);
  }

  tamano(bytes?: number) {
    return this.creativosService.formatearTamano(bytes);
  }

  onFiltroChange() {
    this.cargarCreativos();
  }
}
