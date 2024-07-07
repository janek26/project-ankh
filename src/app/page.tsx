"use client";

import Image from "next/image";
import LogoImg from "./logo.png";
import { Button } from "@/components/ui/button";
import { connect } from "starknetkit";
import { AccountInterface, RpcProvider } from "starknet";
import { useEffect, useState } from "react";
import { InjectedConnector } from "starknetkit/injected";
import {
  Hex,
  HttpTransport,
  Transport,
  createPublicClient,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  KernelAccountClient,
  KernelSmartAccount,
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { ENTRYPOINT_ADDRESS_V07, bundlerActions } from "permissionless";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { sepolia } from "viem/chains";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const connectors = [new InjectedConnector({ options: { id: "argentX" } })];
const chain = sepolia;

export default function Home() {
  const [wallet, setWallet] = useState<AccountInterface>();
  const [l1wallet, setL1Wallet] =
    useState<
      KernelAccountClient<
        "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        Transport,
        typeof chain,
        KernelSmartAccount<
          "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
          HttpTransport,
          typeof chain
        >
      >
    >();

  useEffect(() => {
    // silent connect
    connect({ modalMode: "neverAsk", connectors }).then((res) => {
      if (res.wallet?.account) {
        setWallet(res.wallet.account);
      }
    });
  });

  return (
    <main className="flex flex-col items-center justify-center h-screen space-y-4">
      <Image src={LogoImg} alt="Logo" width={200} height={200} />
      <h1 className="text-4xl font-bold">Welcome to Ankh!</h1>
      <p className="text-lg mt-4">
        Control your L1 account by using a L2 account!
      </p>
      {!wallet && (
        <Button
          onClick={() => {
            connect({
              connectors,
            }).then((res) => {
              if (res.wallet?.account) {
                setWallet(res.wallet.account);
              }
            });
          }}
        >
          Connect Wallet
        </Button>
      )}
      {wallet && (
        <div>
          <h2 className="text-2xl mt-4">Connected Wallet</h2>
          <p className="mt-2">
            Address: <pre>{wallet.address}</pre>
          </p>
          {!l1wallet ? (
            <Button
              onClick={async () => {
                const starknetProvider = new RpcProvider({
                  nodeUrl:
                    "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/dzIL-3f-5I48gx4QueqSaAOVJqVnkuuG",
                });
                const [publicKey] = await starknetProvider.callContract({
                  contractAddress: wallet.address,
                  entrypoint: "get_owner",
                });

                const BUNDLER_RPC = `https://rpc.zerodev.app/api/v2/bundler/${process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID}`;
                const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID}`;

                const publicClient = createPublicClient({
                  transport: http(BUNDLER_RPC),
                  chain,
                });
                const privateKey = keccak256(publicKey as Hex);
                const signer = privateKeyToAccount(privateKey);

                const entryPoint = ENTRYPOINT_ADDRESS_V07;
                const ecdsaValidator = await signerToEcdsaValidator(
                  publicClient,
                  {
                    signer,
                    kernelVersion: KERNEL_V3_1,
                    entryPoint,
                  }
                );

                const account = await createKernelAccount(publicClient, {
                  entryPoint,
                  plugins: {
                    sudo: ecdsaValidator,
                  },
                  kernelVersion: KERNEL_V3_1,
                });

                const kernelClient = createKernelAccountClient({
                  account,
                  chain,
                  entryPoint,
                  bundlerTransport: http(BUNDLER_RPC),
                  middleware: {
                    sponsorUserOperation: async ({ userOperation }) => {
                      const zerodevPaymaster = createZeroDevPaymasterClient({
                        chain,
                        entryPoint,
                        transport: http(PAYMASTER_RPC),
                      });
                      return zerodevPaymaster.sponsorUserOperation({
                        userOperation,
                        entryPoint,
                      });
                    },
                  },
                });

                setL1Wallet(kernelClient);
              }}
            >
              Setup L1 wallet
            </Button>
          ) : (
            <div>
              <h2 className="text-2xl mt-4">L1 Wallet</h2>
              <p className="mt-2">
                Address: <pre>{l1wallet.account.address}</pre>
              </p>
              {/* form to input a tx, receipient, value and data */}
              <form
                className="space-y-2 mt-10"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const recipient = form.recipient.value;
                  const value = form.value.value;
                  const data = form.data.value;
                  console.log("sending tx", recipient, value, data);
                  const userOpHash = await l1wallet.sendUserOperation({
                    userOperation: {
                      callData: await l1wallet.account.encodeCallData({
                        to: recipient,
                        value: BigInt(value),
                        data,
                      }),
                    },
                  });
                  console.log("Submitted UserOp:", userOpHash);

                  const entryPoint = ENTRYPOINT_ADDRESS_V07;
                  const bundlerClient = l1wallet.extend(
                    bundlerActions(entryPoint)
                  );

                  const receipt =
                    await bundlerClient.waitForUserOperationReceipt({
                      hash: userOpHash,
                      pollingInterval: 10000,
                      timeout: 120000,
                    });
                  console.log("UserOp confirmed:", receipt.userOpHash);
                }}
              >
                <label>
                  Recipient:
                  <Input
                    type="text"
                    name="recipient"
                    value={"0xA9B1078d07a188C7710b0Ed12110Cf91Ba79B601"}
                  />
                </label>
                <label>
                  Value:
                  <Input type="text" name="value" value={"1"} />
                </label>
                <label>
                  Data:
                  <Textarea name="data" value={"0x"} />
                </label>
                <Button type="submit">Send Transaction</Button>
              </form>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
