import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  Input,
  ViewChild,
} from '@angular/core';

import {SimpleSketchStore} from './simple-sketch.store';
import {CommonModule} from '@angular/common';

@Component({
  selector: 'simple-sketch',
  standalone: true,
  imports: [CommonModule],
  providers: [SimpleSketchStore],
  templateUrl: './simple-sketch.component.html',
  styleUrl: './simple-sketch.component.scss',
})
export class SimpleSketchComponent implements AfterViewInit {
  @Input() toolbar = true;

  @ViewChild('canvas') canvas: ElementRef<HTMLCanvasElement> | null = null;

  private readonly simpleSketchStore: SimpleSketchStore =
    inject(SimpleSketchStore);

  ngAfterViewInit(): void {
    if (this.canvas === null) return;
    this.simpleSketchStore.init(this.canvas.nativeElement);
  }

  sketch(event: MouseEvent) {
    this.simpleSketchStore.sketch(event);
  }

  startSketch(event: MouseEvent) {
    this.simpleSketchStore.startSketch(event);
  }

  stopSketch(event: MouseEvent) {
    this.simpleSketchStore.stopSketch(event);
  }
}
