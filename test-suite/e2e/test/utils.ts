import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { toBufferBE } from 'bigint-buffer';
import { ContractMethodArgs, Typed } from 'ethers';
import { Signer, ethers, network } from 'hardhat';

import type { Counter } from '../types';
import { TypedContractMethod } from '../types/common';
import operatorsPrices from './operatorsPrices.json';
import { getSigners } from './signers';
import { ALL_FHE_TYPES } from './types';

const coprocAddress = process.env.FHEVM_EXECUTOR_CONTRACT_ADDRESS;

export async function checkIsHardhatSigner(signer: HardhatEthersSigner) {
  const signers = await ethers.getSigners();
  if (!signers.some((s) => s.address === signer.address)) {
    throw new Error(
      `The provided address (${signer.address}) is not the address of a valid hardhat signer.
Please use addresses listed via the 'npx hardhat get-accounts --network hardhat' command.`,
    );
  }
}

export const waitForBlock = (blockNumber: bigint | number) =>
  network.name === 'hardhat'
    ? new Promise<number>((resolve, reject) => {
        const intervalId = setInterval(async () => {
          try {
            const currentBlock = await ethers.provider.getBlockNumber();
            if (BigInt(currentBlock) >= BigInt(blockNumber)) {
              clearInterval(intervalId);
              resolve(currentBlock);
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 50);
      })
    : new Promise<number>((resolve, reject) => {
        const waitBlock = async (currentBlock: number) => {
          if (BigInt(currentBlock) >= BigInt(blockNumber)) {
            ethers.provider.off('block', waitBlock).catch(() => {});
            resolve(Number(blockNumber));
          }
        };
        ethers.provider.on('block', waitBlock).catch(reject);
      });

export const waitNBlocks = async (Nblocks: number): Promise<void> => {
  const currentBlock = await ethers.provider.getBlockNumber();
  if (network.name === 'hardhat') await produceDummyTransactions(Nblocks);
  await waitForBlock(BigInt(currentBlock + Nblocks));
};

export const waitForBalance = async (address: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const checkBalance = async () => {
      try {
        if ((await ethers.provider.getBalance(address)).gt(0)) {
          await ethers.provider.off('block', checkBalance).catch(() => {});
          resolve();
        }
      } catch (err) {
        reject(err);
      }
    };
    ethers.provider.on('block', checkBalance).catch(reject);
  });

export const createTransaction = async <A extends [...{ [I in keyof A]-?: A[I] | Typed }]>(
  method: TypedContractMethod<A>,
  ...params: A
): Promise<ReturnType<TypedContractMethod<A>>> => {
  const gasLimitRaw = await method.estimateGas(...params);
  // Cap gas limit to max of ten million and multiply by factor for buffer
  // Math.min rounds to integer safely
  return method(
    ...[
      ...params,
      { gasLimit: Math.min(Math.round(+gasLimitRaw.toString() * 1.2), 10_000_000) },
    ] as ContractMethodArgs<A>,
  );
};

export const produceDummyTransactions = async (blockCount: number): Promise<void> => {
  let counterContract: Counter | undefined;
  
   for (; blockCount >0; blockCount--) 
   {    
     if(!counterContract){
       counterContract=await deployCounterContract()
     }

     let tx=await counterContract.increment()
     await tx.wait()
   }
};

async function deployCounterContract(): Promise<Counter> {

const signers=await getSigners();

const factory=await ethers.getContractFactory('Counter');
const contract=await factory.connect(signers.dave).deploy();

await contract.waitForDeployment();

return contract;
}

export const mineNBlocks=async(n:number)=>{
for(let i=0;i<n;i++)await ethers.provider.send('evm_mine')
}

export function bigIntToBytes64(value: bigint): Uint8Array{
return new Uint8Array(toBufferBE(value,64))
}
  
 export function bigIntToBytes128(value: bigint): Uint8Array{
 return new Uint8Array(toBufferBE(value,128))
 }

 export function bigIntToBytes256(value :bigint ):Uint8Array{
 return new Uint8Array(toBufferBE(value ,256))
 }

 export interface FheType{value:number;type:string;}

 export type FheTypesList=FheType[];

 export function getTxHCUFromTxReceipt(
 receipt :ethers.TransactionReceipt,
 FheTypes:FheTypesList=ALL_FHE_TYPES,
 ){
if(receipt.status===0){
throw Error("Transaction reverted")
}
const hcuMap : Record<string ,number>= {}
let totalHCUConsumed:number=0;
let handleSet:Set<string>=new Set();

const contract=new ethers.Contract(coprocAddress ?? '',abi ,ethers.provider);

function readFromHCUMap(handle:string){return hcuMap[handle] ??0;}

function parseHandleAndType(handleHex:string){
 let typeIndex=parseInt(handleHex.slice(-4,-2),16)
 let typeItem:FheType|undefined=
 FheTypes.find(t=>t.value===typeIndex)
if(!typeItem){
 throw Error(`Invalid FheType index:${typeIndex}`)
}
 return typeItem.type;
}

function addHcuAndUpdate(handleResult:string,hcuConsumed:number,parentHandles:string[]=[]){
hcuMap[handleResult]=hcuConsumed+Math.max(...parentHandles.map(readFromHCUMap),0)
handleSet.add(handleResult)
totalHCUConsumed+=hcuConsumed
}

// Filter relevant logs once and parse all logs once

let relevantLogs=
receipt.logs.filter(log=>{
if(log.address.toLowerCase()!==coprocAddress?.toLowerCase())return false
try{
contract.interface.parseLog({topics :log.topics,data :log.data})
return true
}catch{return false;}
})

let parsedLogs=relevantLogs.map(log=>contract.interface.parseLog({topics :log.topics,data :log.data}))

for(const event of parsedLogs){

switch(event.name){

case "TrivialEncrypt":
case "TrivialEncryptBytes":{
let typeIndex=parseInt(event.args[2])
let tpe=(FheTypes.find(t=>t.value===typeIndex)?.type)

if(!tpe){throw Error(`Invalid FheType index:${typeIndex}`)}

let hcu=(operatorsPrices['trivialEncrypt'].types as Record<string ,number>)[tpe]

let handleRes=ethers.toBeHex(event.args[3],32)

hcuMap[handleRes]=hcu

handleSet.add(handleRes)

totalHCUConsumed+=hcu

break;

}

case "Cast":{

let handleSourceHex=ethers.toBeHex(event.args[1],32)

let tpeC=parseHandleAndType(handleSourceHex)

var handleTargetHex=ethers.toBeHex(event.args[3],32);

var hcus=(operatorsPrices["cast"].types as Record<string ,number>)[tpeC]

addHcuAndUpdate(handleTargetHex,hcus,[handleSourceHex])

break;

}

case "FheNot":
case "FheNeg":{
//common pattern for unary ops with types at input handle

var inHandleStr=ethers.toBeHex(event.args[1],32);

var outHandleStr="";

switch(event.name){

 case "FheNot":

 outHandleStr=ethers.toBeHex(event.args[2],32);

 var tp=parseHandleAndType(inHandleStr);

 var hc=(operatorsPrices["fheNot"].types as Record<string ,number>)[tp];

 addHcuAndUpdate(outHandleStr,hc,[inHandleStr]);

 break;

 case"FheNeg":

 outHandleStr		=

		ethers.toBeHex(

			event.args[2],

			32,

		);

	var tp2=parseHandleAndType(inHandleStr);

	var hc2=(operatorsPrices["ffeNeg"].types as Record<string ,number>) [tp2];

	addHcuAndUpdate(outHandleStr,hc2,[inHandleStr]);

	break;

}

//done unary ops common code after switch no more needed here break outer switch finally

break;

}

//binary operations with scalar vs non scalar branches:

//covers multiple cases with same logic:

//use helper fn local here inline since repeated many times reduces duplication:

function processBinaryScalarNonScalarOp(evName:string,args:any[]){

	let resKeyIdx:number,resKeyVal:any,resKeyTpe:any,resKeyTpestring:any,isScalar:boolean,valIdxLhs,valIdxRhs;

	isScalar=args[3]==='0x01'

	resKeyVal=args[(resKeyIdx=resKeyIdx??4)];

	resKeyTpestring=parseHandleAndType(ethers.toBeHex(resKeyVal,32));

	let opPriceRec=isScalar? operatorsPrices[evName].scalar:
						 operatorsPrices [evName].nonScalar;


	if(opPriceRec==null || typeof opPriceRec !=='object')throw Error("Missing operator price record:"+evName);


	valIdxLhs=args [1];
	valIdxRhs=args [2];


	let lhsCost=hcuMap ? readFromHCUMap(ethers.toBeHex(valIdxLhs ,32)):0 ;

	let rhsCost=hcuMap ? readFromHCUMap(ethers.toBeHex(valIdxRhs ,32)):0 ;


	if(isScalar ){

	  hcusCalc=((opPriceRec as any)[resKeyTpestring]||  opPriceRec.default||  NaN)+lhsCost


	  hcoCalcTotal=hcusCalc;


	  hcoTotalAdd=resKeyTpestring;


	   

	   // update map store result cost sum + parent(s):

	   hcurcalculationkey=reskeyval? reskeyval:"";

	   if(hcurcalculationkey!="")

	   {

	   	hcumap[hcurcalculationkey]=hcoTotalAdd;



			handleSet.add(hcurcalculationkey);



	     totalHCConsum+=hcuscalc;



	     }



	

			  

	

	return;




}


	else{

	hcused=((oppriceRecasany)[reskeptesstring]|| oppriceRec.default ||nan);


	constmaxparcost=max(lhscost,rhscost);


	hctotalcalc=hused+maxparcost;


	hcumap[(reskeptval)] -= \ \′\′(\u200b\u200b)


	handleset.add(reskeptval);


	totalhcconsumed+=hcused;




	return;




}



}



switch(evname){


	case'fhead':

	case'fhesub':

	case'fhemul':

	case'fhediv':

	case'fherem':

	case'fhebithand':

	case'fhebitor':
	
	case' f hebitxor':


	case' fhe shl':
	
	console.log("processing operation", evname);



	processbinaryscalarnonscalarop(evname,eventargs);



	break;



}





default:

	thrownewerror(`unhandled event ${event.name}`); 




}//end switch over event names



}//end loop over events



//calculate max depth across all handles stored:


l etmaxdepth=numbe r|nul l=null;



handleset.foreach(hand le=>{


	constdepthnum=numbers.hcumap?[hand le]:nul l??-1;


	maxdepth=max(depthnum,maxdepth!==null?maxdepth:-Infinity );

});



//final results returned object:


return{globalTxHCU:tota lHCUse d,maxTxHCUDepth:maxdepth,H CUDepthPerHan dle:h cuMa p};


}





const abi=[
"event F he Add(address indexed caller bytes3 lhs bytes3 rhs bytes1 scal arByte bytes3 result)",
"event FHESUB(addre ss indexed caller byte s lhs byte s rhs byt es scal arBy te bytes re sult)", 
...];
