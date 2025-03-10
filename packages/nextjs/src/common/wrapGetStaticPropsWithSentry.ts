import { addTracingExtensions, getCurrentHub } from '@sentry/core';
import type { GetStaticProps } from 'next';

import { isBuild } from './utils/isBuild';
import { callDataFetcherTraced, withErrorInstrumentation } from './utils/wrapperUtils';

type Props = { [key: string]: unknown };

/**
 * Create a wrapped version of the user's exported `getStaticProps` function
 *
 * @param origGetStaticProps The user's `getStaticProps` function
 * @param parameterizedRoute The page's parameterized route
 * @returns A wrapped version of the function
 */
export function wrapGetStaticPropsWithSentry(
  origGetStaticPropsa: GetStaticProps<Props>,
  parameterizedRoute: string,
): GetStaticProps<Props> {
  return new Proxy(origGetStaticPropsa, {
    apply: (wrappingTarget, thisArg, args: Parameters<GetStaticProps<Props>>) => {
      if (isBuild()) {
        return wrappingTarget.apply(thisArg, args);
      }

      addTracingExtensions();

      const errorWrappedGetStaticProps = withErrorInstrumentation(wrappingTarget);
      const options = getCurrentHub().getClient()?.getOptions();

      if (options?.instrumenter === 'sentry') {
        return callDataFetcherTraced(errorWrappedGetStaticProps, args, {
          parameterizedRoute,
          dataFetchingMethodName: 'getStaticProps',
        });
      }

      return errorWrappedGetStaticProps.apply(thisArg, args);
    },
  });
}

/**
 * @deprecated Use `wrapGetStaticPropsWithSentry` instead.
 */
export const withSentryGetStaticProps = wrapGetStaticPropsWithSentry;
