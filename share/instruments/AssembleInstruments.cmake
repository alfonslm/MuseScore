# SPDX-License-Identifier: GPL-3.0-only
# MuseScore-Studio-CLA-applies
#
# MuseScore Studio
# Music Composition & Notation
#
# Copyright (C) 2026 MuseScore Limited and others
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License version 3 as
# published by the Free Software Foundation.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Joins the instrument definitions in share/instruments/source (one file per
# instrument, in the order of source/manifest.txt) into instruments.xml.
# Same result as `instruments_source.py assemble`; done in CMake so that the
# build needs no Python. Runs at configure time, and CMake re-runs it whenever
# the manifest or one of the files changes.
function(assemble_instruments_xml source_dir output_file)
    set(manifest "${source_dir}/manifest.txt")
    if (NOT EXISTS "${manifest}")
        message(FATAL_ERROR "Instrument definitions not found: ${manifest}")
    endif()

    file(STRINGS "${manifest}" entries ENCODING UTF-8)
    set(depends "${manifest}")
    set(content "")

    foreach(entry IN LISTS entries)
        string(STRIP "${entry}" entry)
        if (entry STREQUAL "" OR entry MATCHES "^#")
            continue()
        endif()

        set(file "${source_dir}/${entry}")
        if (NOT EXISTS "${file}")
            message(FATAL_ERROR "${manifest} lists ${entry}, which does not exist")
        endif()

        file(READ "${file}" chunk)
        if (chunk MATCHES "\n<<<<<<< |\n>>>>>>> |^<<<<<<< ")
            message(FATAL_ERROR "${file} still has merge conflict markers")
        endif()
        string(APPEND content "${chunk}")
        list(APPEND depends "${file}")
    endforeach()

    # Rebuild when a listed file changes (adding or removing one changes the manifest)
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${depends})

    # Only replace the output when it changes, so the resources aren't rebuilt for nothing
    set(tmp_file "${output_file}.tmp")
    file(WRITE "${tmp_file}" "${content}")
    file(COPY_FILE "${tmp_file}" "${output_file}" ONLY_IF_DIFFERENT)
    file(REMOVE "${tmp_file}")
endfunction()
