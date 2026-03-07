import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  readonly excelencia = [
    {
      icono: 'inventory_2',
      titulo: 'Importadores Directos',
      descripcion: 'Eliminamos intermediarios innecesarios para maximizar su rentabilidad neta.',
    },
    {
      icono: 'verified',
      titulo: 'Curaduría Elite',
      descripcion: 'Solo los productos con mayor tracción en mercados globales de alta demanda.',
    },
    {
      icono: 'speed',
      titulo: 'Logística Express',
      descripcion: 'Sistemas optimizados para despachos en 24h, garantizando la satisfacción del cliente.',
    },
    {
      icono: 'diamond',
      titulo: 'Precios Premium',
      descripcion: 'Acceso a precios de volumen desde la primera unidad vendida.',
    },
  ];

  readonly productosDestacados = [
    {
      imagen: 'https://lh3.googleusercontent.com/aida-public/AB6AXuArUEbVHexecXWDTF1Ocf1goVSmUXXMUYzmtOYIKyCXFveJDz_bvTga8EZ3wVlJpacX7veY3f1pdcsFPLMNdEOf2qgwKglImbo0-TMtVFsqZakBIRFRuuEaVfjZWKOfNo2r871eGIM-pKnPY-OFLSzYhZiT2jJ8AR2V7Afk4OcCwOMdl9u50c6C8qi9RhU8BNzAkt1fEUGGF7in9t5fkiY8Xp4XGwY7ZXfctcTbLwq8iyQLPtBNNUjz25PuGBPwSs-TeEGrn9nHm3Y',
      categoria: 'Belleza',
      nombre: 'Masajeador Facial Pro',
      margen: '45%',
      badge: 'Alta Demanda',
    },
    {
      imagen: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBoV9Dl2MPXFR3NshHYfaa-mflNrZUrFWrDUhUrYb-BGhT3MaB934JpU4M8HqW14YC3AjSulLZ6i0mbMglxOP36ZPk1vq-MaUOohOluEkiJNuosetQVP8VAfnCRu3XAOu5UaG3H-KDr-mV3UjYj73WQX_e9fMfApLqHWYsAtcaIXEErjszpYRZwF-Z0j3fADCxo7LdkH2H0VRO0PZyIUNe6ej279TYi-8zigpcZR497JOuWrMjKINFtdRt7ixScKB6smzkcPay83rk',
      categoria: 'Hogar',
      nombre: 'Purificador Aire Mini',
      margen: '60%',
      badge: 'Top Seller',
    },
    {
      imagen: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBI7wv6ClHHOFQaS_xdO8D87_tpGG7UKHVvTdC-ncZ4Fkb9jqhqyq6Yu9kCFlWrBLqs1LAM-ZMi7VZFKvF5SLiRyKhcswLx8VxuLELOy4HIZp7O4T5j_GgX8Cb13AtM36j8nS_bH-74JhBcitbjjbrMS2SNk5w_QBgbMWOESgFA_6RMtK-4ethxiuilEaDruxLNzMC45WqGeT52HrzIkFjP5cYrF2N2dFkuSRBHCFH5fNV2yB-4BXf7S_yNF5VpqAWLGEO1DwOYQLA',
      categoria: 'Fashion',
      nombre: 'Aviador Gold Edition',
      margen: '55%',
      badge: 'Exclusivo',
    },
  ];
}
