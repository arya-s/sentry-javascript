import { addTracingExtensions, captureException, configureScope, runWithAsyncContext } from '@sentry/core';
import { addExceptionMechanism, extractTraceparentData } from '@sentry/utils';

interface FunctionComponent {
  (...args: unknown[]): unknown;
}

interface ClassComponent {
  new (...args: unknown[]): {
    props?: unknown;
    render(...args: unknown[]): unknown;
  };
}

function isReactClassComponent(target: unknown): target is ClassComponent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof target === 'function' && target?.prototype?.isReactComponent;
}

/**
 * Wraps a page component with Sentry error instrumentation.
 */
export function wrapPageComponentWithSentry(pageComponent: FunctionComponent | ClassComponent): unknown {
  addTracingExtensions();
  if (isReactClassComponent(pageComponent)) {
    return class SentryWrappedPageComponent extends pageComponent {
      public render(...args: unknown[]): unknown {
        return runWithAsyncContext(() => {
          configureScope(scope => {
            // We extract the sentry trace data that is put in the component props by datafetcher wrappers
            const sentryTraceData =
              typeof this.props === 'object' &&
              this.props !== null &&
              '_sentryTraceData' in this.props &&
              typeof this.props._sentryTraceData === 'string'
                ? this.props._sentryTraceData
                : undefined;

            if (sentryTraceData) {
              const traceparentData = extractTraceparentData(sentryTraceData);
              scope.setContext('trace', {
                span_id: traceparentData?.parentSpanId,
                trace_id: traceparentData?.traceId,
              });
            }
          });

          try {
            return super.render(...args);
          } catch (e) {
            captureException(e, scope => {
              scope.addEventProcessor(event => {
                addExceptionMechanism(event, {
                  handled: false,
                });
                return event;
              });

              return scope;
            });
            throw e;
          }
        });
      }
    };
  } else if (typeof pageComponent === 'function') {
    return new Proxy(pageComponent, {
      apply(target, thisArg, argArray: [{ _sentryTraceData?: string } | undefined]) {
        return runWithAsyncContext(() => {
          configureScope(scope => {
            // We extract the sentry trace data that is put in the component props by datafetcher wrappers
            const sentryTraceData = argArray?.[0]?._sentryTraceData;

            if (sentryTraceData) {
              const traceparentData = extractTraceparentData(sentryTraceData);
              scope.setContext('trace', {
                span_id: traceparentData?.parentSpanId,
                trace_id: traceparentData?.traceId,
              });
            }
          });
          try {
            return target.apply(thisArg, argArray);
          } catch (e) {
            captureException(e, scope => {
              scope.addEventProcessor(event => {
                addExceptionMechanism(event, {
                  handled: false,
                });
                return event;
              });

              return scope;
            });
            throw e;
          }
        });
      },
    });
  } else {
    return pageComponent;
  }
}
