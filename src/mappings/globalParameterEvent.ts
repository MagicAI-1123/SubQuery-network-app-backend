import { ParameterEvent } from '@subql/contract-sdk/typechain/contracts/Airdropper';
import { EthereumLog } from '@subql/types-ethereum';
import assert from 'assert';
import {
  CacheKey,
  CacheKeyToParamType,
  cacheRemove,
  cacheSet,
} from './utils/cache';
import { defaultAbiCoder } from '@ethersproject/abi';
import { hexZeroPad } from 'ethers/lib/utils';

export async function handleParameterEvent(
  event: EthereumLog<ParameterEvent['args']>
): Promise<void> {
  logger.info('handleParameterEvent');
  assert(event.args, 'No event args');

  const { name, value } = event.args;

  switch (name) {
    case CacheKey.BoosterQueryRewardRate: {
      await boostQueryRewardRateHandler(value);
      break;
    }
    default: {
      await defaultHandler(name as CacheKey, value);
      break;
    }
  }
}

async function boostQueryRewardRateHandler(value: string) {
  logger.info(`boostQueryRewardRateHandler: ${value}`);
  if (value.length <= 66) {
    return await cacheSet(CacheKey.BoosterQueryRewardRate, value);
  }
  await cacheRemove(CacheKey.BoosterQueryRewardRate);
  const [enumValue, uint256Value] = defaultAbiCoder.decode(
    ['uint8', 'uint256'],
    hexZeroPad(value, 64)
  );
  let cacheKey: CacheKey;
  switch (+enumValue.toString()) {
    case 0:
      cacheKey = CacheKey.BoosterQueryRewardRateSubquery;
      break;
    case 1:
      cacheKey = CacheKey.BoosterQueryRewardRateRpc;
      break;
    case 2:
      cacheKey = CacheKey.BoosterQueryRewardRateSqDict;
      break;
    case 3:
      cacheKey = CacheKey.BoosterQueryRewardRateSubgraph;
      break;
    case 4:
      cacheKey = CacheKey.BoosterQueryRewardRateLlm;
      break;
    default:
      logger.warn(`Unknown boostQueryRewardRate project type: ${enumValue}`);
      return;
  }
  await cacheSet(cacheKey, uint256Value.toString());
}

async function defaultHandler(name: CacheKey, value: string) {
  let paramType = CacheKeyToParamType[name];

  // If parameter type is not defined, use smart decoding
  if (!paramType) {
    logger.warn(
      `Parameter type not defined for "${name}". Please add it to CacheKeyToParamType in cache.ts`
    );

    // Attempt smart decoding
    const valueLength = value.length;

    // For 32-byte data (0x + 64 chars = 66 chars), try uint256 first (most common blockchain parameter)
    if (valueLength === 66) {
      const tryTypes = ['uint256', 'address', 'bool'];

      for (const type of tryTypes) {
        try {
          const testValue = defaultAbiCoder.decode([type], value)[0];
          logger.warn(
            `Successfully decoded "${name}" as ${type}: ${
              testValue.toString ? testValue.toString() : testValue
            }`
          );
          paramType = type;
          break;
        } catch (error) {
          // Continue trying next type
        }
      }
    } else {
      // For dynamic types: try bytes first, then string
      const tryTypes = ['bytes', 'string'];

      for (const type of tryTypes) {
        try {
          const testValue = defaultAbiCoder.decode([type], value)[0];
          logger.warn(
            `Successfully decoded "${name}" as ${type}: ${
              testValue.toString ? testValue.toString() : testValue
            }`
          );
          paramType = type;
          break;
        } catch (error) {
          // Continue trying next type
        }
      }
    }

    // If all types fail, throw an error
    if (!paramType) {
      throw new Error(
        `Unable to decode parameter "${name}". Please add the correct type to CacheKeyToParamType.`
      );
    }
  }

  const cacheValue = defaultAbiCoder.decode([paramType], value)[0];
  await cacheSet(name, cacheValue.toString());
}
