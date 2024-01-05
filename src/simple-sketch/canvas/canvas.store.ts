import {Injectable, inject} from '@angular/core';
import {ComponentStore} from '@ngrx/component-store';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  debounceTime,
  filter,
  fromEvent,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import {WINDOW} from '../injection-tokens';
import {Mode} from '../toolbar/toolbar.component';

export interface SimpleSketchCanvasState {
  backgroundColor: string;
  canvasOffsetX: number;
  canvasOffsetY: number;
  isSketching: boolean;
  lineWidth: number;
  mode: Mode;
  paintColor: string;
}

const INITIAL_STATE: SimpleSketchCanvasState = {
  backgroundColor: '#000000',
  canvasOffsetX: 0,
  canvasOffsetY: 0,
  isSketching: false,
  lineWidth: 5,
  mode: Mode.SKETCH,
  paintColor: '#ffffff',
};

export interface Size {
  height: number;
  width: number;
}

@Injectable()
export class SimpleSketchCanvasStore extends ComponentStore<SimpleSketchCanvasState> {
  private canvas$ = new BehaviorSubject<HTMLCanvasElement | null>(null);
  private context$ = new BehaviorSubject<CanvasRenderingContext2D | null>(null);
  private window = inject(WINDOW);

  /**
   * +-------------------------------------------+
   * SELECTORS
   * +-------------------------------------------+
   */
  readonly backgroundColor$: Observable<string> = this.select(
    state => state.backgroundColor
  );

  readonly paintColor$: Observable<string> = this.select(
    state => state.paintColor
  );

  readonly canvasOffsetX$: Observable<number> = this.select(
    state => state.canvasOffsetX
  );

  readonly canvasOffsetY$: Observable<number> = this.select(
    state => state.canvasOffsetY
  );

  readonly isSketching$: Observable<boolean> = this.select(
    state => state.isSketching
  );

  readonly lineWidth$: Observable<number> = this.select(
    state => state.lineWidth
  );

  readonly mode$: Observable<Mode> = this.select(state => state.mode);

  /**
   * +-------------------------------------------+
   * UPDATERS
   * +-------------------------------------------+
   */
  readonly updateBackGroundColor = this.updater(
    (state, newBackgroundColor: string) => ({
      ...state,
      backgroundColor: newBackgroundColor,
    })
  );

  readonly updateIsSketching = this.updater((state, isSketching: boolean) => ({
    ...state,
    isSketching,
  }));

  readonly updateCanvasOffsetX = this.updater(
    (state, newCanvasOffsetX: number) => ({
      ...state,
      canvasOffsetX: newCanvasOffsetX,
    })
  );

  readonly updateCanvasOffsetY = this.updater(
    (state, newCanvasOffsetY: number) => ({
      ...state,
      canvasOffsetY: newCanvasOffsetY,
    })
  );

  readonly updatePaintColor = this.updater((state, newPaintColor: string) => ({
    ...state,
    paintColor: newPaintColor,
  }));

  readonly updateMode = this.updater((state, newMode: Mode) => ({
    ...state,
    mode: newMode,
  }));

  readonly updateStartX = this.updater((state, newStartX: number) => ({
    ...state,
    startX: newStartX,
  }));

  readonly updateStartY = this.updater((state, newStartY: number) => ({
    ...state,
    startY: newStartY,
  }));

  /**
   * +-------------------------------------------+
   * EFFECTS
   * +-------------------------------------------+
   */
  readonly applyBackgroundColor = this.effect(() => {
    return combineLatest([this.backgroundColor$, this.canvas$]).pipe(
      tap(([color, canvas]) => {
        if (canvas) {
          canvas.style.backgroundColor = color;
        }
      })
    );
  });

  readonly clearCanvas = this.effect(trigger$ =>
    combineLatest([trigger$, this.context$, this.canvas$]).pipe(
      tap(([, context, canvas]) => {
        if (context && canvas) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      })
    )
  );

  readonly init = this.effect(
    (data$: Observable<[HTMLCanvasElement, string, string]>) => {
      return data$.pipe(
        tap(([canvas, backgroundColor, paintColor]) => {
          const context = canvas.getContext('2d');
          // Initialize canvas & context properties using the supplied `canvas`.
          this.canvas$.next(canvas);
          this.context$.next(context);

          // Canvases must have their width and height pixel values set. The
          // canvas' _parent (`.canvas-wrapper`), flexes to grow to the
          // available space. Set the actual canvas element to the pixel
          // dimensions available inside its parent.
          const canvasWrapper = canvas.parentElement as HTMLElement;
          const canvasWrapperSize =
            this.getElementSizeMinusPadding(canvasWrapper);

          this.updateCanvasSize([
            canvasWrapperSize.width,
            canvasWrapperSize.height,
          ]);

          // Update property values in component state.
          this.updateCanvasOffsetX(canvas.offsetLeft);
          this.updateCanvasOffsetY(canvas.offsetTop);
          this.updateBackGroundColor(backgroundColor);
          this.updatePaintColor(paintColor);

          this.applyBackgroundColor();

          // Subscribe to resize events so the canvas' pixel dimensions redraw
          // using the values from the post-resize available space.
          fromEvent(this.window, 'resize')
            .pipe(takeUntil(this.destroy$), debounceTime(75))
            .subscribe(() => {
              const canvasWrapperSize =
                this.getElementSizeMinusPadding(canvasWrapper);

              this.updateCanvasSize([
                canvasWrapperSize.width,
                canvasWrapperSize.height,
              ]);
            });
        })
      );
    }
  );

  readonly sketch = this.effect(
    (event$: Observable<MouseEvent | TouchEvent>) => {
      return combineLatest([
        event$,
        this.context$,
        this.isSketching$,
        this.lineWidth$,
        this.canvasOffsetX$,
        this.canvasOffsetY$,
        this.paintColor$,
        this.mode$,
      ]).pipe(
        tap(
          ([
            event,
            context,
            isSketching,
            lineWidth,
            canvasOffsetX,
            canvasOffsetY,
            paintColor,
            mode,
          ]) => {
            if (!isSketching || context === null) return;
            context.globalCompositeOperation =
              mode === Mode.SKETCH ? 'source-over' : 'destination-out';
            // Make the eraser larger than the finer point brush used for
            // sketching.
            const eraserLineWidth = lineWidth * 1.7;
            context.lineWidth =
              mode === Mode.SKETCH ? lineWidth : eraserLineWidth;
            context.lineCap = 'round';
            context.strokeStyle = paintColor;

            const screenPosition = this.eventPosition(event);

            context.lineTo(
              screenPosition.x - canvasOffsetX,
              screenPosition.y - canvasOffsetY
            );
            context.stroke();
          }
        )
      );
    }
  );

  readonly startSketch = this.effect(
    (event$: Observable<MouseEvent | TouchEvent>) => {
      return combineLatest([event$, this.context$]).pipe(
        tap(([event, context]) => {
          this.updateIsSketching(true);
          context?.beginPath();
          this.sketch(event);
        })
      );
    }
  );

  readonly stopSketch = this.effect(
    (event$: Observable<MouseEvent | TouchEvent>) => {
      return combineLatest([event$, this.context$]).pipe(
        tap(([, context]) => {
          this.updateIsSketching(false);
          context?.stroke();
        })
      );
    }
  );

  readonly updateCanvasSize = this.effect(
    (args$: Observable<[number, number]>) => {
      return args$.pipe(
        switchMap(([width, height]) => {
          return combineLatest([
            this.canvas$,
            this.context$,
            of(width),
            of(height),
          ]);
        }),
        filter(
          /* eslint-disable @typescript-eslint/no-unused-vars */
          ([canvas, context, width, height]) =>
            canvas !== null && context !== null
        ),
        tap(([canvas, context, width, height]) => {
          // Resizing the canvas will clear its contents, so store the current
          // canvas contents before resizing so they can be restored after.
          const currentCanvasContent = context!.getImageData(
            0,
            0,
            canvas!.width,
            canvas!.height
          );

          // Now resize the canvas
          canvas!.width = width;
          canvas!.height = height;

          // Reapply saved contents/
          context!.putImageData(currentCanvasContent, 0, 0);
        })
      );
    }
  );

  /**
   * +-------------------------------------------+
   * CLASS METHODS
   * +-------------------------------------------+
   */

  /**
   * Takes a mousemove or touchmove event and return the corresponding position
   * on the screen where the event occurred.
   */
  private eventPosition(event: MouseEvent | TouchEvent): {
    x: number;
    y: number;
  } {
    const isTouchEvent = event instanceof TouchEvent;

    const newX = isTouchEvent
      ? (event as TouchEvent).touches[0].pageX
      : (event as MouseEvent).clientX;
    const newY = isTouchEvent
      ? (event as TouchEvent).touches[0].pageY
      : (event as MouseEvent).clientY;

    return {
      x: newX,
      y: newY,
    };
  }

  /** Returns the size of a supplied element, minus its padding. */
  private getElementSizeMinusPadding(element: HTMLElement): Size {
    const computedStyle = this.window.getComputedStyle(element);
    const width =
      element.clientWidth -
      (parseFloat(computedStyle.paddingLeft) +
        parseFloat(computedStyle.paddingRight));
    const height =
      element.clientHeight -
      (parseFloat(computedStyle.paddingTop) +
        parseFloat(computedStyle.paddingBottom));
    return {width, height} as Size;
  }

  constructor() {
    super(INITIAL_STATE);
  }
}
