exports.basicAdmin = (req, res, next) =>{
    if(req.decodedToken.role === "BasicAdmin" )
        next();
    else
        next(new Error("UnAuthorized"));
}
exports.adminOrAbove = (req, res, next) =>{
    if(req.decodedToken.role === "Admin" || req.decodedToken.role === "BasicAdmin")
        next();
    else
        next(new Error("UnAuthorized"));
}
exports.employeeOrAbove = (req, res, next) =>{
    if(req.decodedToken.role === "Employee" || req.decodedToken.role === "Admin" || req.decodedToken.role === "BasicAdmin")
        next();
    else
        next(new Error("UnAuthorized"));
}