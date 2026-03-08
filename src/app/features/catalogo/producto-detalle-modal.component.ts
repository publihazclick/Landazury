import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CurrencyPipe, TitleCasePipe } from '@angular/common';
import { CreativosService } from '../../core/services/creativos.service';
import type { Producto, Creativo, TipoCreativo } from '../../core/models/producto.model';

@Component({
  selector: 'app-producto-detalle-modal',
  standalone: true,
  imports: [CurrencyPipe, TitleCasePipe],
  templateUrl: './producto-detalle-modal.component.html',
})
export class ProductoDetalleModalComponent {
  @Input() producto!: Producto;
  @Output() cerrar = new EventEmitter<void>();

  private readonly creativosService = inject(CreativosService);
  readonly descargando = signal<string[]>([]);
  readonly imagenActiva = signal(0);

  get margen(): number {
    const { precio_base, precio_final } = this.producto;
    if (!precio_final || precio_base === 0) return 0;
    return Math.round(((precio_final - precio_base) / precio_base) * 100);
  }

  iconoMaterial(tipo: TipoCreativo): string {
    const map: Record<TipoCreativo, string> = {
      video: 'videocam', imagen: 'image', pdf: 'picture_as_pdf',
      documento: 'article', otro: 'folder_zip',
    };
    return map[tipo] ?? 'download';
  }

  chipClass(tipo: TipoCreativo): string {
    const map: Record<TipoCreativo, string> = {
      video:     'text-purple-400 bg-purple-400/10 border-purple-400/20',
      imagen:    'text-sky-400    bg-sky-400/10    border-sky-400/20',
      pdf:       'text-red-400    bg-red-400/10    border-red-400/20',
      documento: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
      otro:      'text-slate-400  bg-slate-700/30  border-slate-700/50',
    };
    return map[tipo] ?? map['otro'];
  }

  tamano(bytes?: number): string {
    return this.creativosService.formatearTamano(bytes);
  }

  estaDescargando(id: string) { return this.descargando().includes(id); }

  async descargar(creativo: Creativo) {
    if (this.estaDescargando(creativo.id)) return;
    this.descargando.update(ids => [...ids, creativo.id]);
    try {
      const url = await this.creativosService.obtenerUrlDescarga(creativo.archivo_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = creativo.nombre;
      a.click();
    } catch { /* silencioso */ } finally {
      this.descargando.update(ids => ids.filter(id => id !== creativo.id));
    }
  }

  onBackdrop(event: MouseEvent) {
    if ((event.target as HTMLElement).dataset['backdrop']) this.cerrar.emit();
  }
}
