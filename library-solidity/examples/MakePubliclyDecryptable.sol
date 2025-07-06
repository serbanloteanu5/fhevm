// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "../lib/FHE.sol";
import "./FHEVMConfig.sol";

contract MakePubliclyDecryptable {
    ebool public valueb;
    euint8 public value8;

    constructor() {
        FHE.setCoprocessor(FHEVMConfig.defaultConfig());
    }

    function makePubliclyDecryptableBool() public {
        valueb = FHE.asEbool(true);
        valueb.makePubliclyDecryptable();
    }

    function isPubliclyDecryptableBool() public view returns (bool) {
        return FHE.isPubliclyDecryptable(valueb);
    }

    function makePubliclyDecryptableUint8() public {
        value8 = FHE.asEuint8(37);
        value8.makePubliclyDecryptable();
    }

    function isPubliclyDecryptableUint8() public view returns (bool) {
        return FHE.isPubliclyDecryptable(value8);
    }
}
