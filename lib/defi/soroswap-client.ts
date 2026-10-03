/**
 * Soroswap Client Wrapper for Open-Stellar Services and UI Panels
 */

export * from './soroswap';
export * from './treasury-policy';

import {
  executeSoroswap,
  getSoroswapQuote,
  getAgentSwapHistory,
  SwapExecutionRequest,
  SwapExecutionResponse,
  SupportedAsset,
} from './soroswap';
import { toStroops, fromStroops } from './treasury-policy';

export class SoroswapClient {
  public static async swap(req: SwapExecutionRequest): Promise<SwapExecutionResponse> {
    return executeSoroswap(req);
  }

  public static getQuote(fromAsset: SupportedAsset, toAsset: SupportedAsset, amount: string, slippage = 0.005) {
    const stroops = toStroops(amount);
    return getSoroswapQuote(fromAsset, toAsset, stroops, slippage);
  }

  public static getHistory(agentId: string) {
    return getAgentSwapHistory(agentId).map((item) => ({
      ...item,
      fromAmountFormatted: fromStroops(item.fromAmount),
      toAmountFormatted: fromStroops(item.toAmount),
      feeFormatted: fromStroops(item.fee),
    }));
  }
}
