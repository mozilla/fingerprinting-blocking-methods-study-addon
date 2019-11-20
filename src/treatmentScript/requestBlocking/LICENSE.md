The code in this folder was originally copied from uBlock Origin at commit  e2fdc1b94bee06da77fa45a59395cb7cedfa61ae. This code comes with a GPLv3 License and typically includes the following code header in source code files.

    /*******************************************************************************

        uBlock Origin - a browser extension to block requests.
        Copyright (C) 2017-present Raymond Hill

        This program is free software: you can redistribute it and/or modify
        it under the terms of the GNU General Public License as published by
        the Free Software Foundation, either version 3 of the License, or
        (at your option) any later version.

        This program is distributed in the hope that it will be useful,
        but WITHOUT ANY WARRANTY; without even the implied warranty of
        MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
        GNU General Public License for more details.

        You should have received a copy of the GNU General Public License
        along with this program.  If not, see {http://www.gnu.org/licenses/}.

        Home: https://github.com/gorhill/uBlock
    */

The uBlock Origin code was then modified in the following ways to extract just it's static network blocking features:
* All user interface features removed.
* Code relating to user interface features, cosmetic filtering, and dynamic filtering was removed wherever easy although there may be lingering settings and functions that were part of broadly scoped modules.
* All assets / filtering lists removed except those used for the experiment this study is being used for.