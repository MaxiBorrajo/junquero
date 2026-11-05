// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {Role, Stats} from "../src/interfaces/IReputation.sol";
import {EscrowHashes} from "../src/libraries/EscrowHashes.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {MockPermitToken} from "./mocks/MockPermitToken.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    DepositMethod,
    CreateParams,
    DepositAuth,
    GroupParams,
    Reservation,
    Agreement,
    Release,
    TokenConfig
} from "../src/libraries/OrderTypes.sol";

contract ScenariosTest is Test {
    uint256 internal constant USDC = 1e6;
    bytes32 internal constant SPEC = keccak256("spec");
    bytes32 internal constant TERMS = keccak256("terms");
    bytes32 internal constant EVIDENCE = keccak256("evidence");

    Deploy internal script;
    Deploy.Deployment internal d;
    MockPermitToken internal usdc;
    address internal admin;
    address internal relayer = makeAddr("relayer");

    address internal requester;
    uint256 internal requesterKey;
    address internal provider;
    uint256 internal providerKey;
    address[] internal jurors;
    address[] internal members;
    uint256[] internal memberKeys;

    function setUp() public {
        vm.warp(1_700_000_000);
        script = new Deploy();
        admin = address(script);
        usdc = new MockPermitToken();
        d = script.deploy(admin, ISignatureTransfer(address(new MockPermit2())), IERC20(address(usdc)), false);

        TokenConfig memory config = TokenConfig({
            allowed: true,
            method: DepositMethod.Permit,
            smallMax: uint128(20 * USDC),
            mediumMax: uint128(300 * USDC),
            milestoneAmount: uint128(150 * USDC),
            witnessAmount: uint128(300 * USDC),
            reputationMin: uint128(5 * USDC),
            feeFloor: uint128(USDC / 4),
            feeCap: uint128(5 * USDC),
            cashFeeFloor: uint128(USDC),
            reservationCap: uint128(10 * USDC),
            jurorFee: uint128(USDC),
            witnessFee: uint128(USDC)
        });
        vm.prank(admin);
        d.escrow.configureToken(address(usdc), config);

        (requester, requesterKey) = makeAddrAndKey("requester");
        (provider, providerKey) = makeAddrAndKey("provider");
        _onboard(requester);
        _onboard(provider);
        usdc.mint(requester, 10_000 * USDC);
        usdc.mint(provider, 100 * USDC);

        for (uint256 i = 0; i < 5; i++) {
            address juror = makeAddr(string.concat("juror", vm.toString(i)));
            jurors.push(juror);
            _onboard(juror);
            vm.prank(admin);
            d.arbitration.setSeedJuror(juror, true);
            usdc.mint(juror, 20 * USDC);
            vm.startPrank(juror);
            usdc.approve(address(d.arbitration), type(uint256).max);
            d.arbitration.stake(uint128(20 * USDC));
            vm.stopPrank();
        }
        for (uint256 i = 0; i < 4; i++) {
            (address member, uint256 key) = makeAddrAndKey(string.concat("member", vm.toString(i)));
            members.push(member);
            memberKeys.push(key);
            _onboard(member);
        }
    }

    function _onboard(address who) internal {
        vm.prank(admin);
        d.credentials.issue(who, 0);
    }

    function _sign(uint256 key, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", d.escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permit(address who, uint256 key, uint256 amount) internal returns (DepositAuth memory) {
        usdc.mint(who, amount);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                who,
                address(d.escrow),
                amount,
                usdc.nonces(who),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
        return
            DepositAuth({
                method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
            });
    }

    function _params(uint256 amount) internal view returns (CreateParams memory) {
        return CreateParams({
            token: address(usdc),
            amount: uint128(amount),
            specHash: SPEC,
            mode: PaymentMode.Escrowed,
            modality: Modality.OnSite,
            startsAt: 0,
            deadline: 0,
            category: 2
        });
    }

    function _create(uint256 amount) internal returns (uint256) {
        DepositAuth memory auth = _permit(requester, requesterKey, amount);
        vm.prank(requester);
        return d.escrow.createOrder(_params(amount), auth);
    }

    function _agree(uint256 orderId, uint256 price, address payer, uint256 payerKey) internal {
        Agreement memory a = Agreement({
            orderId: orderId,
            payer: payer,
            payee: provider,
            price: uint128(price),
            specHash: SPEC,
            termsHash: TERMS,
            expiry: uint40(block.timestamp + 1 hours)
        });
        bytes32 structHash = keccak256(
            abi.encode(
                EscrowHashes.AGREEMENT_TYPEHASH, a.orderId, a.payer, a.payee, a.price, a.specHash, a.termsHash, a.expiry
            )
        );
        bytes memory payerSig = _sign(payerKey, structHash);
        bytes memory payeeSig = _sign(providerKey, structHash);
        vm.prank(relayer);
        d.escrow.agree(a, payerSig, payeeSig);
    }

    function _releaseSigned(uint256 orderId, uint256 amount, uint8 rating, uint256 payerKey)
        internal
        view
        returns (Release memory r, bytes memory sig)
    {
        r = Release({
            orderId: orderId,
            payee: provider,
            amount: uint128(amount),
            rating: rating,
            evidenceHash: EVIDENCE,
            expiry: uint40(block.timestamp + 10 minutes)
        });
        bytes32 structHash = keccak256(
            abi.encode(EscrowHashes.RELEASE_TYPEHASH, r.orderId, r.payee, r.amount, r.rating, r.evidenceHash, r.expiry)
        );
        sig = _sign(payerKey, structHash);
    }

    function _forward(uint256 key, address from, address to, bytes memory data) internal {
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                from,
                to,
                uint256(0),
                uint256(2_000_000),
                d.forwarder.nonces(from),
                deadline,
                keccak256(data)
            )
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Forwarder"),
                keccak256("1"),
                block.chainid,
                address(d.forwarder)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        vm.prank(relayer);
        d.forwarder
            .execute(
                ERC2771Forwarder.ForwardRequestData({
                    from: from,
                    to: to,
                    value: 0,
                    gas: 2_000_000,
                    deadline: deadline,
                    data: data,
                    signature: abi.encodePacked(r, s, v)
                })
            );
    }

    function test_A_anIndividualChangaFromPublicationToReceipt() public {
        uint256 orderId = _create(100 * USDC);
        assertEq(usdc.balanceOf(address(d.escrow)), 100 * USDC);

        _agree(orderId, 100 * USDC, requester, requesterKey);
        vm.prank(provider);
        d.escrow.deliver(orderId, EVIDENCE);

        (Release memory r, bytes memory sig) = _releaseSigned(orderId, 100 * USDC, 5, requesterKey);
        _forward(providerKey, provider, address(d.escrow), abi.encodeCall(IEscrow.release, (r, sig)));

        assertEq(usdc.balanceOf(provider), 200 * USDC);
        assertEq(usdc.balanceOf(address(d.escrow)), 0);
        assertEq(uint8(d.escrow.getOrder(orderId).status), uint8(OrderStatus.Settled));

        vm.prank(provider);
        d.receipt.claim(orderId);
        assertEq(d.receipt.ownerOf(orderId), provider);
        assertEq(d.receipt.info(orderId).category, 2);

        Stats memory providerStats = d.reputation.stats(provider, Role.Provider);
        assertEq(providerStats.closed, 1);
        assertEq(providerStats.ratingSum, 5);
        assertEq(d.reputation.stats(requester, Role.Requester).closed, 1);
    }

    function test_B_aCashChangaPaysThePublicationFeeAndOnlyBuildsLightReputation() public {
        CreateParams memory params = _params(100 * USDC);
        params.mode = PaymentMode.Cash;
        DepositAuth memory auth = _permit(requester, requesterKey, 3 * USDC);
        vm.prank(requester);
        uint256 orderId = d.escrow.createOrder(params, auth);

        assertEq(usdc.balanceOf(address(d.treasury)), 3 * USDC);
        assertEq(usdc.balanceOf(address(d.escrow)), 0);

        _agree(orderId, 100 * USDC, requester, requesterKey);
        (Release memory r, bytes memory sig) = _releaseSigned(orderId, 100 * USDC, 4, requesterKey);
        vm.prank(provider);
        d.escrow.release(r, sig);

        assertEq(usdc.balanceOf(provider), 100 * USDC);
        Stats memory stats = d.reputation.stats(provider, Role.Provider);
        assertEq(stats.cashClosed, 1);
        assertEq(stats.closed, 0);

        vm.prank(provider);
        vm.expectRevert();
        d.receipt.claim(orderId);
    }

    function test_C_aDisputeIsDecidedByAJury() public {
        uint256 orderId = _create(100 * USDC);
        _agree(orderId, 100 * USDC, requester, requesterKey);
        vm.prank(provider);
        d.escrow.deliver(orderId, EVIDENCE);

        DepositAuth memory auth = _permit(requester, requesterKey, 3 * USDC);
        vm.prank(requester);
        d.escrow.openDispute(orderId, keccak256("not good"), auth);
        uint256 caseId = d.arbitration.lastCaseId();

        vm.prank(provider);
        d.arbitration.respond(caseId, keccak256("it was good"));

        for (uint256 i = 0; i < 4; i++) {
            bytes32 commitment = d.arbitration.seedHash(caseId, jurors[i], bytes32(i + 1));
            vm.prank(jurors[i]);
            d.arbitration.commitSeed(caseId, commitment);
        }
        vm.warp(d.arbitration.getCase(caseId).commitEnd + 1);
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(jurors[i]);
            d.arbitration.revealSeed(caseId, bytes32(i + 1));
        }
        vm.warp(d.arbitration.getCase(caseId).revealEnd + 1);
        d.arbitration.draw(caseId);

        address[] memory panel = d.arbitration.jurorsOf(caseId);
        assertEq(panel.length, 3);
        for (uint256 i = 0; i < 3; i++) {
            uint8 vote = i == 2 ? 1 : 2;
            bytes32 commitment = d.arbitration.voteHash(caseId, panel[i], vote, bytes32(uint256(100 + i)));
            vm.prank(panel[i]);
            d.arbitration.commitVote(caseId, commitment);
        }
        vm.warp(d.arbitration.getCase(caseId).commitEnd + 1);
        for (uint256 i = 0; i < 3; i++) {
            uint8 vote = i == 2 ? 1 : 2;
            vm.prank(panel[i]);
            d.arbitration.revealVote(caseId, vote, bytes32(uint256(100 + i)));
        }
        d.arbitration.finalize(caseId);
        vm.warp(d.arbitration.getCase(caseId).appealEnd + 1);
        d.arbitration.execute(caseId);

        assertEq(usdc.balanceOf(provider), 200 * USDC);
        assertEq(usdc.balanceOf(address(d.escrow)), 0);
        assertEq(d.arbitration.rewards(address(usdc), panel[0]), 1_500_000);
        assertEq(d.arbitration.rewards(address(usdc), panel[2]), 0);
        assertEq(d.reputation.stats(requester, Role.Requester).disputesLost, 1);
        assertEq(d.reputation.stats(panel[0], Role.Juror).closedClean, 1);
        assertEq(uint8(d.escrow.getOrder(orderId).status), uint8(OrderStatus.Settled));
    }

    function test_D_cancellationCostsEscalateWithTheStageOfTheChanga() public {
        uint256 free = _create(100 * USDC);
        uint256 payerBefore = usdc.balanceOf(requester);
        vm.prank(requester);
        d.escrow.cancel(free);
        assertEq(usdc.balanceOf(requester) - payerBefore, 100 * USDC);

        uint256 reserved = _create(100 * USDC);
        Reservation memory reservation = Reservation({
            orderId: reserved, payer: requester, payee: provider, expiry: uint40(block.timestamp + 1 hours)
        });
        bytes32 structHash = keccak256(
            abi.encode(
                EscrowHashes.RESERVATION_TYPEHASH,
                reservation.orderId,
                reservation.payer,
                reservation.payee,
                reservation.expiry
            )
        );
        bytes memory payerSig = _sign(requesterKey, structHash);
        bytes memory payeeSig = _sign(providerKey, structHash);
        d.escrow.reserve(reservation, payerSig, payeeSig);
        vm.warp(block.timestamp + 12 hours + 36 hours);
        uint256 providerBefore = usdc.balanceOf(provider);
        vm.prank(requester);
        d.escrow.cancel(reserved);
        assertEq(usdc.balanceOf(provider) - providerBefore, 1 * USDC);

        uint256 agreed = _create(100 * USDC);
        _agree(agreed, 100 * USDC, requester, requesterKey);
        providerBefore = usdc.balanceOf(provider);
        uint256 treasuryBefore = usdc.balanceOf(address(d.treasury));
        vm.prank(requester);
        d.escrow.cancel(agreed);
        assertEq(usdc.balanceOf(provider) - providerBefore, 8 * USDC);
        assertEq(usdc.balanceOf(address(d.treasury)) - treasuryBefore, 2 * USDC);
    }

    function test_D_aFixedDateChangaCanBeCancelledForFreeWithNoticeAndPaysTheNoShowCompensation() public {
        CreateParams memory params = _params(100 * USDC);
        params.startsAt = uint40(block.timestamp + 3 days);
        DepositAuth memory auth = _permit(requester, requesterKey, 100 * USDC);
        vm.prank(requester);
        uint256 early = d.escrow.createOrder(params, auth);
        _agree(early, 100 * USDC, requester, requesterKey);
        uint256 before = usdc.balanceOf(requester);
        vm.prank(requester);
        d.escrow.cancel(early);
        assertEq(usdc.balanceOf(requester) - before, 100 * USDC);

        auth = _permit(requester, requesterKey, 100 * USDC);
        vm.prank(requester);
        uint256 missed = d.escrow.createOrder(params, auth);
        _agree(missed, 100 * USDC, requester, requesterKey);
        vm.warp(params.startsAt);
        vm.prank(provider);
        d.escrow.checkIn(missed);
        vm.warp(block.timestamp + 20 minutes);
        uint256 providerBefore = usdc.balanceOf(provider);
        vm.prank(provider);
        d.escrow.claimNoShow(missed);

        assertEq(usdc.balanceOf(provider) - providerBefore, 8 * USDC);
        assertEq(d.reputation.stats(requester, Role.Requester).failures, 1);
    }

    function test_E_aGroupFundsObjectsAndRecoversItsMoneyWhenTheProviderStaysSilent() public {
        CreateParams memory params = _params(100 * USDC);
        vm.prank(requester);
        uint256 orderId = d.escrow.createGroupOrder(params, GroupParams(address(0), uint40(block.timestamp + 7 days)));
        uint256[4] memory shares = [uint256(40), 30, 20, 10];
        for (uint256 i = 0; i < 4; i++) {
            DepositAuth memory auth = _permit(members[i], memberKeys[i], shares[i] * USDC);
            vm.prank(members[i]);
            d.escrow.contribute(orderId, uint128(shares[i] * USDC), auth);
        }
        assertEq(uint8(d.escrow.getOrder(orderId).status), uint8(OrderStatus.Open));

        vm.prank(requester);
        d.escrow.proposeProvider(orderId, provider);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, 100 * USDC, requester, requesterKey);
        vm.prank(provider);
        d.escrow.deliver(orderId, EVIDENCE);

        vm.prank(members[3]);
        d.escrow.object(orderId, keccak256("objection"), _noAuth());
        DepositAuth memory feeAuth = _permit(members[2], memberKeys[2], 3 * USDC);
        vm.prank(members[2]);
        d.escrow.object(orderId, keccak256("objection"), feeAuth);
        assertEq(uint8(d.escrow.getOrder(orderId).status), uint8(OrderStatus.Disputed));

        uint256 caseId = d.arbitration.lastCaseId();
        vm.warp(d.arbitration.getCase(caseId).commitEnd + 1);
        d.arbitration.resolveByDefault(caseId);

        assertEq(usdc.balanceOf(members[0]), 40 * USDC);
        assertEq(usdc.balanceOf(members[1]), 30 * USDC);
        assertEq(usdc.balanceOf(members[2]), 20 * USDC + 3 * USDC);
        assertEq(usdc.balanceOf(members[3]), 10 * USDC);
        assertEq(usdc.balanceOf(address(d.escrow)), 0);
    }

    function _noAuth() internal pure returns (DepositAuth memory) {
        return DepositAuth({method: DepositMethod.Allowance, nonce: 0, deadline: 0, signature: ""});
    }

    function test_F_theCommunityVotesAParameterChange() public {
        bytes32 recorderRole = d.reputation.RECORDER_ROLE();
        vm.prank(admin);
        d.reputation.grantRole(recorderRole, address(this));
        address[3] memory voters = [makeAddr("voter0"), makeAddr("voter1"), makeAddr("voter2")];
        uint256[3] memory points = [uint256(8), 6, 4];
        for (uint256 i = 0; i < 3; i++) {
            _onboard(voters[i]);
            for (uint256 j = 0; j < points[i]; j++) {
                d.reputation.recordSettled(address(uint160(0x7000 + i * 100 + j)), voters[i], 5, false, false, true);
            }
            usdc.mint(voters[i], 5 * USDC);
            vm.startPrank(voters[i]);
            usdc.approve(address(d.votingWeight), 5 * USDC);
            d.votingWeight.deposit(5 * USDC);
            vm.stopPrank();
        }
        script.handOverToGovernance(d, admin);
        vm.warp(block.timestamp + 1);

        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(d.registry);
        calldatas[0] = abi.encodeCall(ParameterRegistry.set, (ParameterKeys.FEE_BPS, 100));
        string memory description = "Charge a 1% protocol fee";

        vm.prank(voters[0]);
        uint256 proposalId = d.governor.propose(targets, values, calldatas, description);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(voters[0]);
        d.governor.castVote(proposalId, 1);
        vm.prank(voters[1]);
        d.governor.castVote(proposalId, 1);
        vm.prank(voters[2]);
        d.governor.castVote(proposalId, 0);
        vm.warp(d.governor.proposalDeadline(proposalId) + 1);
        d.governor.queue(targets, values, calldatas, keccak256(bytes(description)));
        vm.warp(block.timestamp + 2 days);
        d.governor.execute(targets, values, calldatas, keccak256(bytes(description)));

        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Executed));

        uint256 orderId = _create(100 * USDC);
        _agree(orderId, 100 * USDC, requester, requesterKey);
        vm.prank(provider);
        d.escrow.deliver(orderId, EVIDENCE);
        (Release memory r, bytes memory sig) = _releaseSigned(orderId, 100 * USDC, 5, requesterKey);
        uint256 treasuryBefore = usdc.balanceOf(address(d.treasury));
        uint256 providerBefore = usdc.balanceOf(provider);
        vm.prank(provider);
        d.escrow.release(r, sig);

        assertEq(usdc.balanceOf(address(d.treasury)) - treasuryBefore, 1 * USDC);
        assertEq(usdc.balanceOf(provider) - providerBefore, 99 * USDC);
    }
}
