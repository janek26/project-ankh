"use client";

import Image from "next/image";
import LogoImg from "./logo.png";
import { Button } from "@/components/ui/button";
import { connect } from "starknetkit";
import { AccountInterface, BigNumberish, RpcProvider, num } from "starknet";
import { FC, useCallback, useEffect, useState } from "react";
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
import { LoaderIcon } from "lucide-react";

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

interface StringStruct {
  len: BigNumberish;
  data: BigNumberish[];
}
function stringToStringStruct(str: string): StringStruct {
  const len = str.length;
  const data = str.split("").map((char) => num.toHex(char.charCodeAt(0)));
  return { len, data };
}

const connectors = [new InjectedConnector({ options: { id: "argentX" } })];
const chain = sepolia;

const Address: FC<{ address: string; type: "starknet" | "ethereum" }> = ({
  address,
  type,
}) => {
  return (
    <a
      href={
        type === "ethereum"
          ? `https://sepolia.etherscan.io/address/${address}`
          : `https://sepolia.voyager.online/contract/${address}`
      }
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline"
    >
      {formatAddress(address)}
    </a>
  );
};

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

  const createL1Wallet = useCallback(
    async (wallet: AccountInterface) => {
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
      const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
        signer,
        kernelVersion: KERNEL_V3_1,
        entryPoint,
      });

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
    },
    [setL1Wallet]
  );

  useEffect(() => {
    // silent connect
    connect({ modalMode: "neverAsk", connectors }).then((res) => {
      if (res.wallet?.account) {
        setWallet(res.wallet.account);
        createL1Wallet(res.wallet.account);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="flex flex-col items-center justify-center h-screen space-y-4">
      <Image src={LogoImg} alt="Logo" width={200} height={200} />
      <h1 className="text-4xl font-bold mb-4">Welcome to Ankh!</h1>
      {!wallet && (
        <>
          <p className="text-lg">
            Get a secure L1 account always controlled by your L2 wallet!
          </p>
          <Button
            onClick={() => {
              connect({
                connectors,
              }).then((res) => {
                if (res.wallet?.account) {
                  setWallet(res.wallet.account);
                  createL1Wallet(res.wallet.account);
                }
              });
            }}
          >
            Connect Wallet
          </Button>
        </>
      )}
      {wallet && !l1wallet && (
        <>
          <p>Setting up L1 wallet...</p>
          <LoaderIcon className="animate-spin" />
        </>
      )}
      {l1wallet && wallet && (
        <div>
          <p>
            Your Starknet wallet{" "}
            <Address type="starknet" address={wallet.address} /> now controls L1
            wallet{" "}
            <Address type="ethereum" address={l1wallet.account.address} />.
          </p>

          <form
            className="space-y-2 mt-10"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const recipient = form.recipient.value;
              const value = form.value.value;
              const data = form.data.value;

              // sign tx in starknet
              const sig = await wallet.signMessage({
                types: {
                  StarkNetDomain: [
                    { name: "name", type: "felt" },
                    { name: "version", type: "felt" },
                    { name: "chainId", type: "felt" },
                  ],
                  UserOp: [
                    { name: "to", type: "String" },
                    { name: "value", type: "String" },
                    { name: "data", type: "String" },
                  ],
                  String: [
                    { name: "len", type: "felt" },
                    { name: "data", type: "felt*" },
                  ],
                },
                primaryType: "UserOp",
                domain: {
                  name: "Ankh",
                  version: "1",
                  chainId: await wallet.getChainId(),
                },
                message: {
                  to: stringToStringStruct(recipient),
                  value: stringToStringStruct(value),
                  data: stringToStringStruct(data),
                },
              });
              console.log("signed tx", sig);

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
              const bundlerClient = l1wallet.extend(bundlerActions(entryPoint));

              const receipt = await bundlerClient.waitForUserOperationReceipt({
                hash: userOpHash,
                pollingInterval: 10000,
                timeout: 120000,
              });
              console.log("UserOp confirmed:", receipt.userOpHash);
            }}
          >
            <h2 className="text-2xl font-bold mb-2">Send L1 Transaction</h2>
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
    </main>
  );
}
