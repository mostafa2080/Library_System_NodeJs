const mongoose = require("mongoose");
require("../Model/BooksModel");
require("../Model/BorrowsModel");
require("../Model/MembersModel");
require("../Model/ReadingBooksModel");

const Books = mongoose.model("books");
const Borrows = mongoose.model("borrows");
const Members = mongoose.model("members");
const ReadingBooks = mongoose.model("readingBooks");

//Retrieve all the records from the Borrows collection
exports.getAllBorrows = async (req, res, next) => {
    try {
        const results = await Borrows.find({});
        res.status(200).json({ results });
    } catch (err) {
        next(err);
    }
};

//Retrieve a specific record from the Borrows collection
exports.getBorrow = async (req, res, next) => {
    try {
        const result = await Borrows.findOne({ _id: req.params._id });
        res.status(200).json({ result });
    } catch (err) {
        next(err);
    }
};
//Add a new record to the Borrows collection
exports.addBorrow = async (req, res, next) => {
    const continueWithBorrow = await canBorrow(req, res, next);
    if (!continueWithBorrow) {
        res.status(403).json({
            message: "Can't borrow.",
        });
        return;
    }
    try {
        const date = new Date();
        const twoDaysDeadlineDate = date.setDate(date.getDate() + 2);
        const result = await new Borrows({
            bookID: req.body.bookID,
            memberID: req.body.memberID,
            employeeID: req.body.employeeID,
            borrowDate: date.now,
            returnDate: null,
            deadlineDate: req.body.deadlineDate || new Date(twoDaysDeadlineDate).toISOString(),
        }).save();

        const book = await Books.findOne(
            {
                _id: result.bookID,
            },
            { copiesCount: 1, title: 1 }
        );

        //Finds the count of all active borrows for a specific book
        if (this.totalAvailableCopies <= 0) {
            await Books.updateOne(
                { _id: result.bookID },
                {
                    $set: {
                        isAvailable: false,
                    },
                }
            );
            res.status(200).json({
                result,
                message: `Book: ${book.title} is not available anymore.`,
            });
        }

        res.status(201).json({ result });
    } catch (err) {
        next(err);
    }
};
// Update a borrow record in  database
exports.updateBorrow = async (req, res, next) => {
    try {
        const result = await Borrows.findOneAndUpdate(
            { _id: req.params._id },
            {
                $set: {
                    bookID: req.body.bookID,
                    memberID: req.body.memberID,
                    employeeID: req.body.employeeID,
                    returnDate: req.body.returnDate,
                    deadlineDate: req.body.deadlineDate,
                },
            },
            { new: true }
        );
        //Find a Book
        const book = await Books.findOne(
            {
                _id: result.bookID,
            },
            { copiesCount: 1, title: 1 }
        );

        if (this.totalAvailableCopies > 0) {
            await Books.updateOne(
                { _id: result.bookID },
                {
                    $set: {
                        isAvailable: true,
                    },
                }
            );

            res.status(200).json({
                result,
                message: `Book: ${book.title} is now available again.`,
            });
        } else {
            await Books.updateOne(
                { _id: result.bookID },
                {
                    $set: {
                        isAvailable: false,
                    },
                }
            );
            res.status(200).json({ result });
        }
    } catch (err) {
        next(err);
    }
};

//Return a Book
exports.deleteBorrow = async (req, res, next) => {
    try {
        const result = await Borrows.findOneAndDelete({ _id: req.params._id });
        if (!result) throw new Error("Borrow not found");

        const book = await Books.findOne({
            _id: result.bookID,
            isAvailable: false,
        });

        if (book) {
            await Books.updateOne(
                {
                    _id: result.bookID,
                    isAvailable: false,
                },
                {
                    $set: {
                        isAvailable: true,
                    },
                }
            );
            res.status(200).json({
                result,
                message: `Book: ${book.title} is now available again.`,
            });
        }

        res.status(200).json({ result });
    } catch (err) {
        next(err);
    }
};

//Check if a member can borrow a book
const canBorrow = async (req, res, next) => {
    const book = await Books.findOne({
        _id: req.body.bookID,
        isAvailable: true,
    });

    if (!book) return false;
    console.log("book found");

    const member = await Members.findOne({
        _id: req.body.memberID,
        isBanned: false,
    });

    if (!member) return false;
    console.log("member found");

    const unreturnedBorrows = await unreturnedBorrowsOfSameBookCount(
        req,
        res,
        next
    );

    const availableCopies = await this.totalAvailableCopies(req.body.bookID);
    console.log(availableCopies);
    if (unreturnedBorrows === 0 && availableCopies > 1 && !member.isBanned) {
        return true;
    }
    return false;
};
//count the number of unreturned Borrows
const unreturnedBorrowsOfSameBookCount = async (req, res, next) =>
    await Borrows.find({
        bookID: req.body.bookID,
        memberID: req.body.memberID,
        returnDate: null,
    }).count();

//checks for unreturned borrows and returned borrows that are overdue and updates the corresponding members to set the isBanned flag to true or false accordingly
exports.bansCheckCycle = async () => {
    const date = new Date().toISOString();
    try {
        const unreturnedBorrows = await Borrows.find({
            returnDate: null,
            $expr: { $lt: ["$deadlineDate", date] },
        });

        unreturnedBorrows.forEach(async (borrow) => {
            const result = await Members.findOneAndUpdate(
                {
                    _id: borrow.memberID,
                },
                {
                    $set: {
                        isBanned: true,
                    },
                },
                { new: true }
            );
        });
    } catch (err) {
        console.log(err);
    }
    try {
        const returnedBorrowsAfterDeadline = await Borrows.find({
            $expr: { $gt: ["$returnDate", "$deadlineDate"] },
        });

        returnedBorrowsAfterDeadline.forEach(async (borrow) => {
            if (borrow.returnDate.setDate(borrow.returnDate + 7) > date) {
                const result = await Members.findOneAndUpdate(
                    {
                        _id: borrow.memberID,
                    },
                    {
                        $set: {
                            isBanned: true,
                        },
                    },
                    { new: true }
                );
            } else {
                const result = await Members.findOneAndUpdate(
                    {
                        _id: borrow.memberID,
                    },
                    {
                        $set: {
                            isBanned: false,
                        },
                    },
                    { new: true }
                );
            }
        });
    } catch (err) {
        console.log(err);
    }

    const d = new Date();
    console.log("Ban/unban cycle complete at:", d.toLocaleString());
};

exports.totalAvailableCopies = async (bookID) => {
    const book = await Books.findOne({
        _id: bookID,
    });

    const totalCopies = book.copiesCount;

    const borrowedCopiesCount = await Borrows.find({
        bookID: bookID,
        returnDate: null,
    }).count();

    const readingCopiesCount = await ReadingBooks.find({
        book: bookID,
        returned: false,
    }).count();

    return totalCopies - (borrowedCopiesCount + readingCopiesCount);
};
